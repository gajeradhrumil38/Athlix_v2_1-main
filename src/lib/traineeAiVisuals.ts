import type { TraineeDashboard, TraineeWorkout } from './coachData';

// Visuals the Ask AI card can attach to an answer. The model only CHOOSES a
// visual by writing a tag like [[chart:exercise:Bench Press]] — every number
// drawn comes from the trainee's real data here, never from the model.

export type AiVisual =
  | { kind: 'exercise'; name: string }
  | { kind: 'volume' }
  | { kind: 'bodyweight' }
  | { kind: 'muscles' }
  | { kind: 'week' }
  | { kind: 'prs' };

// Actions the model can PROPOSE. Nothing runs until the coach taps it, and
// each one is re-checked against the real data first (see traineeAiActions).
export type AiAction =
  | { kind: 'progress'; name: string; weight: number }
  | { kind: 'plan' }
  | { kind: 'checkin' };

const TAG = /\[\[\s*(chart|stats|list|action)\s*:\s*([a-z]+)\s*(?::\s*([^\]]+?))?\s*\]\]/gi;

export function parseAiAnswer(raw: string): { text: string; visuals: AiVisual[]; actions: AiAction[] } {
  const visuals: AiVisual[] = [];
  const actions: AiAction[] = [];
  const seen = new Set<string>();
  for (const m of raw.matchAll(TAG)) {
    const kind = m[2].toLowerCase();
    const arg = m[3]?.trim();
    if (m[1].toLowerCase() === 'action') {
      let a: AiAction | null = null;
      if (kind === 'plan' || kind === 'checkin') a = { kind };
      else if (kind === 'progress' && arg) {
        const cut = arg.lastIndexOf(':');
        const weight = cut > 0 ? Number(arg.slice(cut + 1).replace(/[^\d.]/g, '')) : NaN;
        if (cut > 0 && Number.isFinite(weight) && weight > 0) a = { kind: 'progress', name: arg.slice(0, cut).trim(), weight };
      }
      const key = JSON.stringify(a).toLowerCase();
      if (a && !seen.has(key)) { seen.add(key); actions.push(a); }
      continue;
    }
    let v: AiVisual | null = null;
    if (kind === 'exercise' && arg) v = { kind: 'exercise', name: arg };
    else if (kind === 'volume' || kind === 'bodyweight' || kind === 'muscles' || kind === 'week' || kind === 'prs') v = { kind };
    if (!v) continue;
    const key = JSON.stringify(v).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    visuals.push(v);
  }
  const text = raw.replace(TAG, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, visuals: visuals.slice(0, 3), actions: actions.slice(0, 3) };
}

const DAY = 86_400_000;
const parseDay = (d: string) => new Date(`${d}T00:00:00`).getTime();
const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// The model may write "Bench press" for "Barbell Bench Press": exact, then
// contains, then best word overlap.
export function matchExercise(workouts: TraineeWorkout[], wanted: string): string | null {
  const names = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const n = norm(wanted);
  if (!n) return null;
  const exact = names.find((x) => norm(x) === n);
  if (exact) return exact;
  const contains = names.filter((x) => norm(x).includes(n) || n.includes(norm(x)));
  if (contains.length) return contains.sort((a, b) => a.length - b.length)[0];
  const words = new Set(n.split(' '));
  let best: string | null = null;
  let bestScore = 0;
  for (const x of names) {
    const score = norm(x).split(' ').filter((w) => words.has(w)).length;
    if (score > bestScore) { best = x; bestScore = score; }
  }
  return bestScore > 0 ? best : null;
}

// Top weight per session for one exercise, oldest first.
export function exerciseSeries(workouts: TraineeWorkout[], name: string): { label: string; value: number }[] {
  return workouts
    .filter((w) => w.exercises.some((e) => e.name === name))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({ label: short(w.date), value: Math.round(Math.max(...w.exercises.filter((e) => e.name === name).map((e) => e.weight || 0))) }));
}

export function weeklyVolume(workouts: TraineeWorkout[], now = Date.now()): { label: string; value: number }[] {
  const w8 = Array.from({ length: 8 }, () => 0);
  for (const w of workouts) {
    const wi = Math.floor((now - parseDay(w.date)) / (7 * DAY));
    if (wi < 0 || wi > 7) continue;
    w8[7 - wi] += w.exercises.reduce((a, e) => a + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0);
  }
  return w8.map((v, i) => ({ label: i === 7 ? 'Now' : `${7 - i}w`, value: Math.round(v) }));
}

export function bodyWeightSeries(dash: TraineeDashboard): { label: string; value: number }[] {
  return [...dash.bodyWeight.data].sort((a, b) => a.date.localeCompare(b.date)).slice(-20)
    .map((b) => ({ label: short(b.date), value: Math.round(b.weight * 10) / 10 }));
}

export function muscleSets(workouts: TraineeWorkout[], days = 7, now = Date.now()): { muscle: string; sets: number }[] {
  const by: Record<string, number> = {};
  for (const w of workouts) {
    if (now - parseDay(w.date) > days * DAY) continue;
    for (const e of w.exercises) {
      const m = e.muscle_group || 'Other';
      by[m] = (by[m] || 0) + (e.sets || 0);
    }
  }
  return Object.entries(by).map(([muscle, sets]) => ({ muscle, sets })).filter((x) => x.sets > 0).sort((a, b) => b.sets - a.sets);
}

export function weekStats(workouts: TraineeWorkout[], now = Date.now()) {
  const inRange = (w: TraineeWorkout, from: number, to: number) => { const age = now - parseDay(w.date); return age >= from * DAY && age < to * DAY; };
  const sum = (ws: TraineeWorkout[]) => ({
    sessions: ws.length,
    sets: ws.reduce((a, w) => a + w.exercises.reduce((b, e) => b + (e.sets || 0), 0), 0),
    volume: Math.round(ws.reduce((a, w) => a + w.exercises.reduce((b, e) => b + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0), 0)),
  });
  return { thisWeek: sum(workouts.filter((w) => inRange(w, 0, 7))), lastWeek: sum(workouts.filter((w) => inRange(w, 7, 14))) };
}
