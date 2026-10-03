import type { TraineeDashboard, TraineeWorkout } from './coachData';
import { exerciseSeries, type AiVisual } from './traineeAiVisuals';

// Facts the app works out on its own — no AI. They become the Ask AI card's
// question chips and the grounding for the daily brief, so the AI explains
// real signals instead of guessing at problems.

export interface Signal {
  id: string;
  level: 'high' | 'warn' | 'good';
  fact: string;      // plain statement, fed to the AI
  chip: string;      // the question the coach can tap
  visual?: AiVisual;
}

const DAY = 86_400_000;
const parseDay = (d: string) => new Date(`${d}T00:00:00`).getTime();
const MAIN_REGIONS = ['Chest', 'Back', 'Legs', 'Shoulders'];

const volumeOf = (w: TraineeWorkout) => w.exercises.reduce((a, e) => a + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0);

export function computeSignals(
  dash: TraineeDashboard,
  plans: { id: string; title: string }[] = [],
  now = Date.now(),
): Signal[] {
  const out: Signal[] = [];
  const first = dash.name.split(' ')[0] || dash.name;

  if (dash.recovery.shared && dash.recovery.data != null && dash.recovery.data < 40) {
    out.push({ id: 'recovery', level: 'high', fact: `WHOOP recovery is low at ${dash.recovery.data}%.`, chip: `Recovery ${dash.recovery.data}% — go lighter today?` });
  }

  if (!dash.workouts.shared) return out;
  const ws = dash.workouts.data;
  const daysSince = (d: number) => Math.floor((now - d) / DAY);
  const last = ws.reduce((m, w) => Math.max(m, parseDay(w.date)), 0);

  if (!last) {
    out.push({ id: 'none', level: 'warn', fact: `${first} hasn't logged any workouts yet.`, chip: 'How should we get started?' });
    return out;
  }
  const quiet = daysSince(last);
  if (quiet >= 5) out.push({ id: 'quiet', level: quiet >= 7 ? 'high' : 'warn', fact: `No workout in ${quiet} days.`, chip: `No session in ${quiet} days — what now?`, visual: { kind: 'week' } });

  const notStarted = plans.filter((p) => !ws.some((w) => w.source_plan_id === p.id));
  if (notStarted.length) {
    out.push({ id: 'plans', level: 'warn', fact: `Assigned plan${notStarted.length > 1 ? 's' : ''} not started: ${notStarted.map((p) => p.title).join(', ')}.`, chip: `Plan "${notStarted[0].title}" not started — why?` });
  }

  // Stalled or slipping lifts: the most-trained exercises whose top weight
  // hasn't gone up over their last 3 sessions (recent ones only).
  const recent = ws.filter((w) => now - parseDay(w.date) <= 56 * DAY);
  const freq: Record<string, number> = {};
  for (const w of recent) for (const n of new Set(w.exercises.map((e) => e.name))) freq[n] = (freq[n] || 0) + 1;
  const stalls: Signal[] = [];
  for (const name of Object.keys(freq).sort((a, b) => freq[b] - freq[a])) {
    if (freq[name] < 3 || stalls.length >= 2) continue;
    const series = exerciseSeries(recent, name).filter((p) => p.value > 0);
    if (series.length < 3) continue;
    const lastDate = Math.max(...recent.filter((w) => w.exercises.some((e) => e.name === name)).map((w) => parseDay(w.date)));
    if (daysSince(lastDate) > 21) continue;
    const [a, b, c] = series.slice(-3).map((p) => p.value);
    if (c < Math.max(a, b) * 0.95) stalls.push({ id: `down-${name}`, level: 'warn', fact: `${name} top weight dropped: ${a} → ${b} → ${c} lb over the last 3 sessions.`, chip: `${name} slipping — why?`, visual: { kind: 'exercise', name } });
    else if (c <= a) stalls.push({ id: `flat-${name}`, level: 'warn', fact: `${name} has not gone up in 3 sessions (${a} → ${b} → ${c} lb).`, chip: `${name} flat for 3 sessions — next step?`, visual: { kind: 'exercise', name } });
  }
  out.push(...stalls);

  // A main region left out while they're otherwise training.
  if (quiet <= 7) {
    const lastHit = (region: string) => ws.reduce((m, w) => (w.exercises.some((e) => (e.muscle_group || '').toLowerCase().includes(region.toLowerCase())) ? Math.max(m, parseDay(w.date)) : m), 0);
    const gaps = MAIN_REGIONS.map((r) => ({ r, at: lastHit(r) })).map((x) => ({ ...x, days: x.at ? daysSince(x.at) : null }))
      .filter((x) => x.days == null || x.days >= 8)
      .sort((x, y) => (y.days ?? 999) - (x.days ?? 999));
    if (gaps.length) {
      const g = gaps[0];
      out.push({ id: `gap-${g.r}`, level: 'warn', fact: g.days == null ? `${g.r} hasn't been trained in the logged history.` : `${g.r} not trained in ${g.days} days.`, chip: g.days == null ? `${g.r} never trained — add it?` : `${g.r} not trained in ${g.days} days`, visual: { kind: 'muscles' } });
    }
  }

  // This week's volume well under the 3 weeks before.
  const weekVol = (k: number) => ws.filter((w) => { const age = now - parseDay(w.date); return age >= k * 7 * DAY && age < (k + 1) * 7 * DAY; }).reduce((a, w) => a + volumeOf(w), 0);
  const prior = [1, 2, 3].map(weekVol);
  const avg = prior.reduce((a, b) => a + b, 0) / 3;
  const thisWeek = weekVol(0);
  if (avg > 0 && thisWeek < avg * 0.65 && quiet < 5) {
    const drop = Math.round((1 - thisWeek / avg) * 100);
    out.push({ id: 'volume', level: 'warn', fact: `This week's volume (${Math.round(thisWeek)} lb) is ${drop}% under the 3-week average (${Math.round(avg)} lb).`, chip: `Volume down ${drop}% this week`, visual: { kind: 'volume' } });
  }

  if (dash.prs.shared) {
    const fresh = dash.prs.data.filter((p) => now - parseDay(p.achieved_date) <= 7 * DAY).sort((a, b) => b.achieved_date.localeCompare(a.achieved_date))[0];
    if (fresh) out.push({ id: `pr-${fresh.exercise_name}`, level: 'good', fact: `New PR this week: ${fresh.exercise_name} ${Math.round(fresh.best_weight)} lb × ${fresh.best_reps}.`, chip: `New PR on ${fresh.exercise_name} — what next?`, visual: { kind: 'exercise', name: fresh.exercise_name } });
  }

  const rank = { high: 0, warn: 1, good: 2 } as const;
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}
