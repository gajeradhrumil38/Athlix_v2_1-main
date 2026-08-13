import { format, differenceInCalendarDays } from 'date-fns';
import type { LocalWorkout, LocalExercise, LocalPersonalRecord } from './supabaseData';
import type { FoodScan } from '../features/food/types';
import type { SavedRun } from '../features/running/utils/storage';
import type { WhoopAllData } from '../features/whoop/services/whoopService';
import { buildDailyLoads, computeLoadMetrics } from '../features/whoop/services/loadMetrics';
import { computeCardiacHealth } from '../features/whoop/services/cardiacHealth';
import { buildImprovementModel, buildImprovementModelSection } from './improvementModel';
import { buildCoachMemorySection, type CoachMemory } from './coachMemory';

export type WorkoutWithExercises = LocalWorkout & { exercises?: LocalExercise[] };

/* ── Parse "YYYY-MM-DD" as local calendar date (not UTC midnight) ────── */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — never shifts timezone
}

export function calDaysSince(dateStr: string): number {
  return differenceInCalendarDays(new Date(), parseLocalDate(dateStr));
}

/* ── Weekly volume per muscle group (Israetel MEV reference) ────────── */
const MEV: Record<string, string> = {
  chest: '10-20', back: '10-25', shoulders: '12-20',
  legs: '12-20', quads: '12-20', hamstrings: '10-16',
  glutes: '12-18', biceps: '10-15', triceps: '10-15', abs: '10-16',
};

export function weeklyVolume(workouts: WorkoutWithExercises[]): string {
  const sets: Record<string, number> = {};
  for (const w of workouts) {
    if (calDaysSince(w.date) > 6) continue;
    for (const ex of (w.exercises || [])) {
      const mg = (ex.muscle_group || 'other').toLowerCase();
      sets[mg] = (sets[mg] || 0) + (Number(ex.sets) || 1);
    }
  }
  if (!Object.keys(sets).length) return '  No sets logged this week';
  return Object.entries(sets)
    .sort((a, b) => b[1] - a[1])
    .map(([mg, n]) => {
      const rec = MEV[mg];
      const cap = mg.charAt(0).toUpperCase() + mg.slice(1);
      return rec ? `  ${cap}: ${n} sets (rec ${rec}/wk)` : `  ${cap}: ${n} sets`;
    })
    .join('\n');
}

/* ── Monthly volume per muscle group (last 28 days, ~4-week block) ──── */
export function monthlyVolume(workouts: WorkoutWithExercises[]): string {
  const sets: Record<string, number> = {};
  const sessions: Record<string, number> = {};
  for (const w of workouts) {
    if (calDaysSince(w.date) > 27) continue;
    for (const ex of (w.exercises || [])) {
      const mg = (ex.muscle_group || 'other').toLowerCase();
      sets[mg] = (sets[mg] || 0) + (Number(ex.sets) || 1);
      sessions[mg] = (sessions[mg] || 0) + 1;
    }
  }
  if (!Object.keys(sets).length) return '  No sets logged in the last 28 days';
  return Object.entries(sets)
    .sort((a, b) => b[1] - a[1])
    .map(([mg, n]) => {
      const cap = mg.charAt(0).toUpperCase() + mg.slice(1);
      const avgPerWeek = (n / 4).toFixed(1);
      return `  ${cap}: ${n} sets total (~${avgPerWeek}/wk avg, ${sessions[mg]} session${sessions[mg] !== 1 ? 's' : ''})`;
    })
    .join('\n');
}

/* ── Progressive overload: compare last 14d vs 15–56d ──────────────── */
export function progressionReport(workouts: WorkoutWithExercises[], unit: string): string {
  const hist: Record<string, { recent: number[]; older: number[] }> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const ex of (w.exercises || [])) {
      if (ex.weight <= 0) continue;
      if (!hist[ex.name]) hist[ex.name] = { recent: [], older: [] };
      if (age <= 14) hist[ex.name].recent.push(ex.weight);
      else if (age <= 56) hist[ex.name].older.push(ex.weight);
    }
  }
  const lines: string[] = [];
  for (const [name, { recent, older }] of Object.entries(hist)) {
    if (!recent.length || !older.length) continue;
    const r = Math.max(...recent);
    const o = Math.max(...older);
    const diff = +(r - o).toFixed(1);
    if (diff > 0) lines.push(`  ↑ ${name}: ${o}→${r}${unit} (+${diff})`);
    else if (diff < 0) lines.push(`  ↓ ${name}: ${o}→${r}${unit} (${diff})`);
    else lines.push(`  ~ ${name}: plateau at ${r}${unit} (8+ weeks)`);
  }
  return lines.length ? lines.join('\n') : '  Insufficient data for trend analysis';
}

/* ── Training frequency & streak ────────────────────────────────────── */
export function trainingStats(workouts: WorkoutWithExercises[]): string {
  const dateSeen = new Set(workouts.map((w) => w.date));
  const last28 = workouts.filter((w) => calDaysSince(w.date) <= 28);
  const sessionsPerWeek = (new Set(last28.map((w) => w.date)).size / 4).toFixed(1);
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = format(new Date(new Date().setDate(new Date().getDate() - i)), 'yyyy-MM-dd');
    if (dateSeen.has(d)) streak++;
    else if (i > 0) break;
  }
  return `${sessionsPerWeek} sessions/week avg (last 28d) · Streak: ${streak} day${streak !== 1 ? 's' : ''}`;
}

/* ── Parse skincare adherence from localStorage ─────────────────── */
export function parseSkincareStats(): { weekPercent: number; streak: number } | null {
  try {
    const raw = localStorage.getItem('athlix_skincare_v1');
    if (!raw) return null;
    const state = JSON.parse(raw) as {
      weeks: Record<string, { days: Record<string, { subcats: Record<string, { products: Array<{ status: string }> }> }> }>;
    };
    if (!state?.weeks) return null;

    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekId = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;

    const weekData = state.weeks[weekId];
    if (!weekData?.days) return null;

    let done = 0;
    let total = 0;
    for (const dayData of Object.values(weekData.days)) {
      for (const subcat of Object.values(dayData?.subcats ?? {})) {
        for (const p of subcat.products ?? []) {
          total++;
          if (p.status === 'done') done++;
        }
      }
    }

    const weekPercent = total > 0 ? Math.round((done / total) * 100) : 0;

    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayName = DAY_NAMES[(new Date().getDay() + 6) % 7];
    const todayIndex = DAY_NAMES.indexOf(todayName);
    let streak = 0;
    for (let i = todayIndex; i >= 0; i--) {
      const dayData = weekData.days[DAY_NAMES[i]];
      if (!dayData?.subcats) break;
      const allDone = Object.values(dayData.subcats).every((s) =>
        (s.products ?? []).filter((p) => p.status !== 'skipped').every((p) => p.status === 'done'),
      );
      if (allDone) streak++;
      else break;
    }

    return { weekPercent, streak };
  } catch {
    return null;
  }
}

/* ── Section builders for optional data sources ───────────────────── */
export function buildFoodSection(scans: FoodScan[]): string {
  if (!scans.length) return '';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recent = scans.filter((s) => new Date(s.scan_date) >= cutoff).slice(0, 14);
  if (!recent.length) return '';
  const lines = recent.map(
    (s) => `  ${s.scan_date} — ${s.food_name}: ${s.total_calories}cal | P:${s.total_protein}g C:${s.total_carbs}g F:${s.total_fat}g`,
  );
  return `\n\n━━ NUTRITION (last 7 days) ━━\n${lines.join('\n')}`;
}

export function buildRunSection(runs: SavedRun[]): string {
  if (!runs.length) return '';
  const recent = [...runs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const lines = recent.map((r) => {
    const date = new Date(r.timestamp).toISOString().slice(0, 10);
    const km = r.distance.toFixed(2);
    const totalSecs = Math.floor(r.duration / 1000);
    const dur = `${Math.floor(totalSecs / 60)}:${(totalSecs % 60).toString().padStart(2, '0')}`;
    const paceMin = Math.floor(r.pace);
    const paceSec = Math.round((r.pace % 1) * 60).toString().padStart(2, '0');
    return `  ${date} — ${km}km in ${dur} (${paceMin}:${paceSec}/km avg)`;
  });
  return `\n\n━━ RUNNING (last ${recent.length} runs) ━━\n${lines.join('\n')}`;
}

// Fuse WHOOP recovery + training load into ONE concrete "how hard / how much"
// call for today. Surfaced near the top so the coach scales every plan to it,
// instead of leaving the WHOOP numbers unused at the bottom of the context.
export function readinessDirective(data: WhoopAllData | null): string {
  // Not connected → no directive at all (rule 13 falls back to muscle recovery).
  if (!data?.recovery?.length) return '';

  const r = data.recovery[0];
  const score = Number(r.recovery_score);
  const age = calDaysSince(r.date);

  // No usable reading for today: no score yet (didn't sleep/sync), a 0 (which
  // WHOOP uses for "no reading", NOT red), or stale (2+ days old — not worn
  // recently). Never fake a readiness from an empty/old value — tell the coach
  // to size the session by muscle recovery + how the user feels.
  if (!Number.isFinite(score) || score <= 0 || age >= 2) {
    const why = (!Number.isFinite(score) || score <= 0)
      ? 'no recovery score yet today'
      : `last WHOOP reading was ${age}d ago (band not worn / not synced)`;
    return `\n\n━━ TODAY'S DIRECTIVE ━━\n  No fresh WHOOP recovery — ${why}. Size the session by MUSCLE RECOVERY STATUS + how they say they feel; do NOT cite a recovery % as if it's today's.`;
  }

  let acwr = 0;
  try {
    const lm = computeLoadMetrics(buildDailyLoads(data.cycles || [], 28));
    if (lm.daysOfData >= 7 && lm.acwr > 0) acwr = lm.acwr;
  } catch { /* not enough history — recovery alone drives the call */ }

  const overreached = acwr > 1.5;
  let level: string;
  let action: string;
  if (score < 34 || overreached) {
    level = 'DELOAD / EASY';
    action = 'cut total sets ~40%, drop intensity (no top sets or PR attempts), or do active recovery / mobility + a walk. Sleep is the priority.';
  } else if (score < 67) {
    level = 'MODERATE';
    action = 'train normally but capped — hit your target sets, leave 1–2 reps in reserve, skip max/PR attempts.';
  } else {
    level = acwr && acwr < 0.8 ? 'PUSH (room to add load)' : 'PUSH';
    action = 'green light — full volume, and go for a top set or a PR on your most-rested muscle.';
  }
  const staleNote = age === 1 ? ' (reading is from yesterday — confirm how they feel)' : '';
  return `\n\n━━ TODAY'S DIRECTIVE (recovery ${score}%${acwr ? `, ACWR ${acwr.toFixed(2)}` : ''})${staleNote} ━━\n  ${level} — ${action}\n  (Scale EVERY "what/how much to train" answer to this: match sets & intensity to the call above.)`;
}

export function buildWhoopSection(data: WhoopAllData | null): string {
  if (!data?.recovery?.length) return '';
  const r = data.recovery[0];
  const s = data.sleep?.[0];
  const sleepH = s && s.total_in_bed_time_milli > 0 ? (s.total_in_bed_time_milli / 3_600_000).toFixed(1) : '—';
  const strain = (data.cycles?.[0]?.strain_score ?? 0) > 0 ? data.cycles![0].strain_score!.toFixed(1) : '—';

  const score = Number(r.recovery_score);
  const age = calDaysSince(r.date);
  const validToday = Number.isFinite(score) && score > 0 && age < 2;

  // A 0/absent score is "no reading" (NOT red), and a 2+ day-old reading is
  // stale — don't present either as a live readiness.
  const readiness = !validToday
    ? (!Number.isFinite(score) || score <= 0 ? 'NO READING — band not worn / not scored' : `STALE — ${age}d old, treat as background not today`)
    : score >= 67 ? 'GREEN — safe to push hard'
    : score >= 34 ? 'YELLOW — moderate, quality over volume'
    : 'RED — prioritise recovery / easy day';
  const recoveryCell = Number.isFinite(score) && score > 0 ? `${score}%` : 'n/a';

  // Derived load + cardiac intelligence — the same models the home dashboard
  // shows. Needs a few weeks of cycles to be meaningful; degrades to nothing
  // when there isn't enough, so a short WHOOP window just omits it.
  let derived = '';
  try {
    const loads = buildDailyLoads(data.cycles || [], 28);
    const lm = computeLoadMetrics(loads);
    const ch = computeCardiacHealth(data.recovery || [], data.cycles || [], data.workouts || []);
    if (lm.daysOfData >= 7 && lm.acwr > 0) {
      const acwrZone = lm.acwr > 1.5 ? 'HIGH injury risk — back off'
        : lm.acwr >= 0.8 ? 'optimal sweet-spot'
        : 'detraining — safe to add load';
      derived += `\n  Load — ACWR ${lm.acwr.toFixed(2)} (${acwrZone}); form ${lm.form > 0 ? '+' : ''}${lm.form.toFixed(1)} (fitness ${lm.ctl.toFixed(1)} / fatigue ${lm.atl.toFixed(1)})`;
    }
    if (ch.vo2max != null) {
      const rhrTrend = ch.restingHrDelta < 0 ? '↓ improving' : ch.restingHrDelta > 0 ? '↑ rising' : 'flat';
      derived += `\n  Fitness — est. VO2max ${ch.vo2max} (${ch.vo2maxLabel}); resting HR trend ${rhrTrend}`;
    }
  } catch { /* insufficient WHOOP history — skip derived metrics */ }

  return `\n\n━━ WHOOP READINESS (latest: ${r.date}) ━━\n  Recovery: ${recoveryCell} → ${readiness}\n  HRV: ${r.hrv_rmssd_milli > 0 ? `${Math.round(r.hrv_rmssd_milli)}ms` : '—'} | RHR: ${r.resting_heart_rate > 0 ? `${r.resting_heart_rate}bpm` : '—'} | Sleep: ${sleepH}h | Strain: ${strain}${derived}`;
}

// WHOOP logs each activity (Weight Training, Running, …) with its OWN measured
// strain — the day-level strain in buildWhoopSection can't tell lifting from a
// run from just walking around. This surfaces the per-activity breakdown so the
// coach can answer "how much strain did my lift / run actually cost" and sanity-
// check it against how hard the user THINKS they trained. data.workouts already
// holds the last ~10 WHOOP activities (day tab: /activity/workout?limit=10).
export function buildWhoopActivitySection(data: WhoopAllData | null): string {
  const acts = (data?.workouts ?? [])
    .filter((w) => Number.isFinite(w.strain) && (w.strain ?? 0) > 0 && calDaysSince(w.date) <= 14)
    .sort((a, b) => (a.start < b.start ? 1 : -1)); // most recent first
  if (!acts.length) return '';

  // Roll up by sport so "strain from weightlifting vs running" is one glance.
  const bySport = new Map<string, { n: number; strain: number; min: number; kcal: number; km: number }>();
  for (const w of acts) {
    const g = bySport.get(w.sport_name) ?? { n: 0, strain: 0, min: 0, kcal: 0, km: 0 };
    g.n += 1;
    g.strain += w.strain ?? 0;
    g.min += (w.duration_milli ?? 0) / 60_000;
    g.kcal += (w.kilojoules ?? 0) / 4.184; // WHOOP energy is kilojoules
    g.km += (w.distance_meter ?? 0) / 1000;
    bySport.set(w.sport_name, g);
  }

  const sportLines = [...bySport.entries()]
    .sort((a, b) => b[1].strain - a[1].strain)
    .map(([sport, g]) => {
      const dist = g.km >= 0.1 ? `, ${g.km.toFixed(1)}km` : '';
      const kcal = g.kcal >= 1 ? `, ${Math.round(g.kcal)}kcal` : '';
      return `  ${sport}: ${g.n}× | strain ${g.strain.toFixed(1)} total (avg ${(g.strain / g.n).toFixed(1)}) | ${Math.round(g.min)}min${dist}${kcal}`;
    });

  // Call out the most recent activity so "how much did today's lift cost?" is answerable.
  const last = acts[0];
  const lastAge = calDaysSince(last.date);
  const when = lastAge === 0 ? 'today' : lastAge === 1 ? 'yesterday' : `${lastAge}d ago`;
  const lastLine = `  Latest: ${last.sport_name} ${when} — strain ${(last.strain ?? 0).toFixed(1)}${last.average_heart_rate ? `, avg HR ${last.average_heart_rate}` : ''}`;

  return `\n\n━━ WHOOP ACTIVITIES (last ${acts.length}, ≤14d — measured strain by sport) ━━\n${sportLines.join('\n')}\n${lastLine}\n  (Per-activity cardiovascular strain straight from WHOOP. Use it to see what a lift vs a run actually cost, to spot when a "light" session was secretly high-strain, and to feed the load picture alongside recovery — don't stack another hard day on top of a high-strain one when recovery is already down.)`;
}

export function buildSkincareSection(stats: { weekPercent: number; streak: number } | null): string {
  if (!stats) return '';
  return `\n\n━━ SKINCARE ━━\n  This week: ${stats.weekPercent}% complete | Streak: ${stats.streak} day${stats.streak !== 1 ? 's' : ''}`;
}

/* ── System prompt builder ──────────────────────────────────────────── */
export function buildSystemPrompt(
  profile: any,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  whoopData: WhoopAllData | null,
  skincareStats: { weekPercent: number; streak: number } | null,
  // 'insight' drops the structured RESPONSE FORMAT block, which otherwise conflicts with the pill's own plain-sentence prompt.
  variant: 'chat' | 'insight' = 'chat',
  memory: CoachMemory | null = null,
): string {
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  const name = profile?.full_name || 'Athlete';
  const bodyWeight = profile?.body_weight
    ? `${profile.body_weight} ${profile.body_weight_unit}`
    : 'not set';
  const height =
    profile?.height_feet != null
      ? `${profile.height_feet}'${profile.height_inches ?? 0}"`
      : 'not set';
  const unit = profile?.unit_preference || 'lbs';
  const improvementModel = buildImprovementModel(workouts, prs, foodScans, recentRuns, whoopData, 90);

  // Kept intentionally lean — the system prompt rides on EVERY request, so a
  // bloated one burns the free-tier token-per-minute budget and rate-limits the
  // coach. 4 detailed sessions + a short older list is plenty of context.
  const detailedSection = workouts.slice(0, 4).map((w) => {
    const age = calDaysSince(w.date);
    const label = age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`;
    const header = `${w.date} (${label}) — ${w.title} · ${w.duration_minutes ?? '?'} min`;
    const exLines = (w.exercises || []).map(
      (ex) => `    · ${ex.name}: ${ex.sets}×${ex.reps}${ex.weight > 0 ? ` @ ${ex.weight}${ex.unit}` : ''}`,
    );
    return exLines.length ? `  ${header}\n${exLines.join('\n')}` : `  ${header}`;
  }).join('\n');

  const olderSection = workouts.slice(4, 12)
    .map((w) => `  ${w.date} — ${w.title}${w.muscle_groups?.length ? ` [${w.muscle_groups.join(', ')}]` : ''}`)
    .join('\n');

  const muscleAge: Record<string, number> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    const bump = (mg?: string | null) => {
      const k = (mg || '').trim().toLowerCase();
      if (!k) return;
      if (muscleAge[k] === undefined || age < muscleAge[k]) muscleAge[k] = age;
    };
    // Use BOTH the workout-level muscle_groups AND each exercise's muscle_group
    // so recovery status covers every muscle actually trained and agrees with
    // the THIS WEEK "trained" list (which is exercise-level).
    for (const mg of (w.muscle_groups || [])) bump(mg);
    for (const ex of (w.exercises || [])) bump(ex.muscle_group);
  }
  const recoverySection = Object.entries(muscleAge)
    .sort((a, b) => a[1] - b[1])
    .map(([mg, d]) => {
      const status = d === 0 ? '⛔ trained today' : d === 1 ? '⛔ 1d — rest' : d === 2 ? '⚠️ 2d — borderline' : '✅ recovered';
      return `  ${mg.charAt(0).toUpperCase() + mg.slice(1)}: ${d}d since last session — ${status}`;
    })
    .join('\n');

  // One unambiguous, pre-computed fact so the model can't hallucinate which
  // muscles were trained this week (e.g. claiming "you already did Back" when
  // Back wasn't trained). Trained = muscles hit in the last 7 days; rested/due =
  // everything else, most-rested first — the ONLY valid pool for "what to train".
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const weekTrained = new Set<string>();
  for (const w of workouts) {
    if (calDaysSince(w.date) > 6) continue;
    for (const ex of (w.exercises || [])) {
      const mg = (ex.muscle_group || '').trim().toLowerCase();
      if (mg) weekTrained.add(mg);
    }
  }
  const restedDue = Object.entries(muscleAge)
    .filter(([mg]) => !weekTrained.has(mg))
    .sort((a, b) => b[1] - a[1])
    .map(([mg, d]) => `${cap(mg)} (${d}d ago)`);
  const thisWeekSection =
    `  Trained this week: ${weekTrained.size ? [...weekTrained].map(cap).join(', ') : 'nothing yet'}\n` +
    `  Rested / due (recommend ONLY from these): ${restedDue.length ? restedDue.join(', ') : '— (train anything)'}`;

  const prSection = prs.slice(0, 15)
    .map((p) => `  ${p.exercise_name}: ${p.best_weight}${unit} × ${p.best_reps} reps (set ${p.achieved_date})`)
    .join('\n');

  const responseFormatSection = variant === 'chat' ? `
RESPONSE FORMAT:
• Open with the ANSWER — what to do / the direct reply — like a trainer talking to them. No preamble, no "Based on your data", and NEVER open with a meta-statement about the data you have (do not say "Insufficient data", "no comparison available", or similar).
• If there IS prior history on the relevant lift/metric, weave the trend in naturally (old → new number). If there ISN'T enough history yet, just leave it out silently — never announce its absence, never invent a number.
• Be brief: at most 2–3 short sentences of prose, ≤70 words total. Say the point once — don't restate numbers you're already putting in a prescription line. Use **bold** only for exercise names and key numbers.
• EVERY prescribed exercise MUST be its own bullet line in EXACTLY this shape so the app renders it as a card: "· Exercise Name: N×R @ W${unit}" (e.g. "· Bench Press: 3×8 @ 80${unit}"). One exercise per line, name before the colon, no extra words like "aim for" inside the line. Bodyweight → drop the "@ W".
• No closing summary, no motivational sign-off.
• The chat UI can render inline visuals from logged data — trend charts, Apple-style progress rings (weekly snapshot, recovery), and a macro donut. Never say you can't plot; a relevant visual is attached automatically for progress/recovery/weekly/macro questions, so answer in words and let it accompany you.
` : `
FORMAT: follow the plain-language, sentence-count instructions given in the user message exactly — no bold, no bullet lists, no headers.
`;

  const toolCallingRule = variant === 'chat'
    ? `\n9. "What should I train today?" / "what should I do?" / planning questions → a TEXT plan, never a tool call. Do this exactly:
   a) Pick ONE target muscle group STRICTLY from the "Rested / due" line in THIS WEEK — never a muscle on the "Trained this week" line, and never a ⛔ in RECOVERY STATUS. Prefer the most-rested one that's below its weekly target. Do NOT claim a muscle was trained/rested contrary to the THIS WEEK data.
   b) Open with ONE short line naming it, why, AND scaling to TODAY'S DIRECTIVE if WHOOP data exists — e.g. "Recovery's 78% (push) and **Back** is your most rested (only 3 sets) — good day to load it."
   c) Give 4–5 exercises, EACH on its own line in EXACTLY this shape so the app renders it as a card: "· Exercise Name: sets×reps @ weight${unit}". The weight MUST come from their PERSONAL RECORDS / RECENT SESSIONS for that lift (match it, or +2.5–5${unit} to progress). If there is NO logged weight for a lift (or it's bodyweight), DROP the "@ weight" entirely and just write "· Name: sets×reps" — NEVER guess or invent a load. SCALE the sets & intensity to TODAY'S DIRECTIVE: PUSH → full sets, heavy top set; MODERATE → your target sets, 1–2 reps in reserve; DELOAD → ~40% fewer sets, lighter, or swap to mobility/active recovery.
   d) End with ONE line naming a beatable PR to chase, with the exact weight×reps — ONLY if a real PR exists AND the directive is PUSH; skip it on a MODERATE/DELOAD day.
   Skip anything ⛔. Do NOT call show_exercise_form here — only when the user picks a specific exercise to log.
10. "How's my week?" / "how am I doing?" / "how's my progress this week?" → lead with the ONE strongest signal from THIS WEEK, not a list. State the session count and, from WEEKLY VOLUME, the standout muscle (most sets) and the one that's lagging/under target — with real numbers. Add ONE line of praise or a nudge with a concrete next step (e.g. "Back's only 3 sets — hit it next"). ≤3 sentences. A weekly-snapshot ring is attached automatically, so don't re-list every muscle.
11. "Am I improving on <lift>?" / "how's my <lift> going?" → use STRENGTH TRENDS + RECENT SESSIONS/PERSONAL RECORDS for that EXACT lift. State old→new top weight (or est. 1RM — or top REPS for a bodyweight/reps-only lift) with the delta and a one-word verdict: improving / plateaued / dropped. If only ONE session of that lift exists, say so plainly ("only one session logged — I need another to call a trend") — NEVER invent a comparison or a second number. A trend chart is attached automatically.
12. "Which muscle am I neglecting?" → name the 1–2 muscle groups with the FEWEST weekly sets vs their target — read the numbers straight from WEEKLY VOLUME and the THIS WEEK "Rested / due" line, and cite the real set counts (e.g. "**Back** — 0 sets this week; **Shoulders** — 2"). A muscle with 0 sets this week IS neglected even if trained earlier. Do NOT attribute exercises to muscles beyond what's in the data, and never say a muscle was trained if it's not on the Trained line.
13. "Should I train (hard) today?" / "am I recovered?" / "how much should I do?" / readiness → answer straight from TODAY'S DIRECTIVE + WHOOP READINESS. In one line: recovery % and the call (push / moderate / deload), then what it means for today (target a rested muscle at the matching volume/intensity, or rest). Weave in ACWR/sleep only if notable. If TODAY'S DIRECTIVE says there's no fresh WHOOP recovery (not connected, no score yet, or a stale reading), do NOT cite a recovery % as today's — say you don't have today's recovery and size it from MUSCLE RECOVERY STATUS + how they feel (train the most-rested group, rest if everything is ⛔).
FUSION (applies to ALL of the above): always cross the training log (THIS WEEK, WEEKLY VOLUME, RECOVERY STATUS) WITH WHOOP readiness — pick WHAT from the muscle data and HOW MUCH from TODAY'S DIRECTIVE. Never recommend pushing hard on a RED/low-recovery day, and never prescribe a rested muscle that's actually ⛔.

STRAIN: if asked "how much strain from lifting / running", "which activity taxed me most", or "how hard was that session", answer from WHOOP ACTIVITIES — quote the actual per-sport strain numbers (never invent them), and only cite it if that block exists. When sizing today's plan, treat a recent HIGH-strain activity as extra fatigue on top of recovery: if yesterday's lift or run was high strain AND recovery is down, bias toward MODERATE/DELOAD even if the muscle looks rested. If WHOOP ACTIVITIES is absent (nothing logged / not connected), say you don't have per-activity strain rather than guessing.`
    : '';

  return `You are an expert strength & conditioning coach embedded in the Athlix fitness app. Your role: give ${name} evidence-based, data-driven advice using ONLY their logged data below. Never fabricate numbers.

SCOPE — you ONLY handle ${name}'s fitness: training, exercises, nutrition, recovery, running, body metrics, goals, and using Athlix. If asked anything off-topic (general knowledge, coding, current events, other apps, chit-chat), politely decline in ONE short line and steer back — e.g. "I'm your fitness coach — ask me about your training, nutrition, or recovery." Do not answer the off-topic part.

UNDERSTANDING — answer the SPECIFIC thing ${name} asked, not a generic version. If a word looks misspelled or informal, map it to the closest match in their logged exercises / muscle groups before answering (e.g. "bech"→Bench Press, "legz"→Legs). If you genuinely can't tell what they mean, ask one short clarifying question instead of guessing.

TODAY: ${today}
ATHLETE: ${name} | BW: ${bodyWeight} | Height: ${height} | Unit: ${unit}
TRAINING PATTERN: ${workouts.length ? trainingStats(workouts) : 'no data'}

━━ THIS WEEK (last 7 days) — AUTHORITATIVE ━━
${thisWeekSection}
(Treat this as fact: a muscle is "trained this week" ONLY if it's on the Trained line. Never claim otherwise.)
${readinessDirective(whoopData)}

${buildImprovementModelSection(improvementModel)}

━━ RECENT SESSIONS (full detail) ━━
${detailedSection || '  No workouts logged yet'}
${olderSection ? `\n━━ OLDER SESSIONS ━━\n${olderSection}` : ''}

━━ MUSCLE RECOVERY STATUS ━━
${recoverySection || '  No muscle data — cannot assess recovery'}

━━ WEEKLY VOLUME (this week) ━━
${weeklyVolume(workouts)}

━━ MONTHLY VOLUME (last 28 days) ━━
${monthlyVolume(workouts)}

━━ STRENGTH TRENDS (last 2 vs prior 6 weeks) ━━
${progressionReport(workouts, unit)}

━━ PERSONAL RECORDS ━━
${prSection || '  No records yet'}

${responseFormatSection}
COACHING RULES:
1. ⛔ muscle groups must NOT appear in today's plan — check RECOVERY STATUS
2. Plateau on an exercise → suggest rep scheme change or drop set, not just "keep going"
3. Weekly sets below MEV range → flag it, suggest extra sets
4. PR opportunity → call it out explicitly with the weight to hit
5. For ML/model/readiness questions, use IMPROVEMENT MODEL V1 and ML readiness requirements; do not claim custom ML is ready unless status is ml_ready
6. When discussing exercise progress, prefer total volume per logged session unless the user explicitly asks for best weight, reps, or estimated 1RM
7. BODYWEIGHT / REPS-ONLY exercises (no load ever logged — e.g. push-ups, crunches, leg raises, planks): weight/volume are meaningless for them, so measure progress in REPS (top reps per session). Cite reps, never a weight, and progress them by adding reps, not load.
8. For nutrition/science questions use Google Search for current evidence${toolCallingRule}

${buildCoachMemorySection(memory, workouts)}${buildFoodSection(foodScans)}${buildRunSection(recentRuns)}${buildWhoopSection(whoopData)}${buildWhoopActivitySection(whoopData)}${buildSkincareSection(skincareStats)}`;
}
