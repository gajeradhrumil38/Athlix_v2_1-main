import { format, differenceInCalendarDays } from 'date-fns';
import type { LocalWorkout, LocalExercise, LocalPersonalRecord } from './supabaseData';
import type { FoodScan } from '../features/food/types';
import type { SavedRun } from '../features/running/utils/storage';
import type { WhoopAllData } from '../features/whoop/services/whoopService';

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
      sets[mg] = (sets[mg] || 0) + ex.sets;
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
      sets[mg] = (sets[mg] || 0) + ex.sets;
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

export function buildWhoopSection(data: WhoopAllData | null): string {
  if (!data?.recovery?.length) return '';
  const r = data.recovery[0];
  const s = data.sleep?.[0];
  const sleepH = s ? (s.total_in_bed_time_milli / 3_600_000).toFixed(1) : '?';
  const strain = data.cycles?.[0]?.strain_score?.toFixed(1) ?? '?';
  return `\n\n━━ WHOOP RECOVERY (latest: ${r.date}) ━━\n  Recovery: ${r.recovery_score}% | HRV: ${Math.round(r.hrv_rmssd_milli)}ms | RHR: ${r.resting_heart_rate}bpm | Sleep: ${sleepH}h | Strain: ${strain}`;
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

  const detailedSection = workouts.slice(0, 7).map((w) => {
    const age = calDaysSince(w.date);
    const label = age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`;
    const header = `${w.date} (${label}) — ${w.title} · ${w.duration_minutes ?? '?'} min`;
    const exLines = (w.exercises || []).map(
      (ex) => `    · ${ex.name}: ${ex.sets}×${ex.reps}${ex.weight > 0 ? ` @ ${ex.weight}${ex.unit}` : ''}`,
    );
    return exLines.length ? `  ${header}\n${exLines.join('\n')}` : `  ${header}`;
  }).join('\n');

  const olderSection = workouts.slice(7, 20)
    .map((w) => `  ${w.date} — ${w.title}${w.muscle_groups?.length ? ` [${w.muscle_groups.join(', ')}]` : ''}`)
    .join('\n');

  const muscleAge: Record<string, number> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const mg of (w.muscle_groups || [])) {
      const k = mg.toLowerCase();
      if (muscleAge[k] === undefined || age < muscleAge[k]) muscleAge[k] = age;
    }
  }
  const recoverySection = Object.entries(muscleAge)
    .sort((a, b) => a[1] - b[1])
    .map(([mg, d]) => {
      const status = d === 0 ? '⛔ trained today' : d === 1 ? '⛔ 1d — rest' : d === 2 ? '⚠️ 2d — borderline' : '✅ recovered';
      return `  ${mg.charAt(0).toUpperCase() + mg.slice(1)}: ${d}d since last session — ${status}`;
    })
    .join('\n');

  const prSection = prs.slice(0, 30)
    .map((p) => `  ${p.exercise_name}: ${p.best_weight}${unit} × ${p.best_reps} reps (set ${p.achieved_date})`)
    .join('\n');

  return `You are an expert strength & conditioning coach embedded in the Athlix fitness app. Your role: give ${name} evidence-based, data-driven advice using ONLY their logged data below. Never fabricate numbers.

TODAY: ${today}
ATHLETE: ${name} | BW: ${bodyWeight} | Height: ${height} | Unit: ${unit}
TRAINING PATTERN: ${workouts.length ? trainingStats(workouts) : 'no data'}

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

RESPONSE FORMAT (non-negotiable):
• Open with the direct answer in ≤2 sentences — no preamble, no "Based on your data", no "You should"
• Use **bold** for exercise names and key numbers only
• Workout plans: one line per exercise → "· Exercise: Xs × Y–Z reps @ W${unit}"
• No closing summaries, no motivational sign-offs
• Total response: aim for ≤180 words. If a list is needed, use bullet lines.

COACHING RULES:
1. ⛔ muscle groups must NOT appear in today's plan — check RECOVERY STATUS
2. Plateau on an exercise → suggest rep scheme change or drop set, not just "keep going"
3. Weekly sets below MEV range → flag it, suggest extra sets
4. PR opportunity → call it out explicitly with the weight to hit
5. For nutrition/science questions use Google Search for current evidence
6. "What should I train (today)?" / "what should I do?" / similar planning questions → this is a TEXT answer, never a tool call. Build the plan from WEEKLY VOLUME (this week), MONTHLY VOLUME (last 28 days), and MUSCLE RECOVERY STATUS together — call out any muscle group under its MEV for the week/month, skip anything ⛔, and give real exercises with sets/reps. Do NOT call show_exercise_form for these questions — only call it once the user picks a specific exercise to log.

${buildFoodSection(foodScans)}${buildRunSection(recentRuns)}${buildWhoopSection(whoopData)}${buildSkincareSection(skincareStats)}`;
}
