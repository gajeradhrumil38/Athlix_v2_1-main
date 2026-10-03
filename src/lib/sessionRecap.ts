import type { WorkoutState } from '../pages/Log';
import type { TraineeDashboard } from './coachData';
import { setsToSave } from './sessionChecklist';

// The numbers behind a post-session recap, worked out from what was just saved
// and the trainee's history BEFORE it — so "PR" and "vs last time" are real.

export interface RecapExercise {
  name: string;
  sets: number;
  top: { weight: number; reps: number };
  prev: { weight: number; reps: number; date: string } | null;
  pr: boolean;
}
export interface Recap {
  exercises: RecapExercise[];
  sets: number;
  volume: number;
  prevVolume: number | null; // the trainee's previous session
  prs: string[];
}

const top = (sets: { weight: number; reps: number }[]) =>
  sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a), sets[0]);

export function buildRecap(workout: WorkoutState, before: TraineeDashboard): Recap {
  const history = before.workouts.shared ? [...before.workouts.data].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const exercises = setsToSave(workout).map(({ exercise, sets }) => {
    const done = sets.map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }));
    const best = top(done);
    const prevW = history.find((w) => w.exercises.some((e) => e.name === exercise.name));
    const prev = prevW ? { ...top(prevW.exercises.filter((e) => e.name === exercise.name).map((e) => ({ weight: e.weight, reps: e.reps }))), date: prevW.date } : null;
    const histBest = Math.max(0, ...history.flatMap((w) => w.exercises.filter((e) => e.name === exercise.name).map((e) => e.weight)));
    const recorded = before.prs.shared ? before.prs.data.find((p) => p.exercise_name === exercise.name)?.best_weight ?? 0 : 0;
    // A PR needs something to beat — a first-ever lift isn't a "record".
    const pr = best.weight > 0 && (histBest > 0 || recorded > 0) && best.weight > Math.max(histBest, recorded);
    return { name: exercise.name, sets: done.length, top: best, prev, pr };
  });
  const volume = setsToSave(workout).reduce((a, { sets }) => a + sets.reduce((b, s) => b + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0);
  const last = history[0];
  const prevVolume = last ? last.exercises.reduce((a, e) => a + (e.sets || 1) * e.reps * e.weight, 0) : null;
  return {
    exercises,
    sets: exercises.reduce((a, e) => a + e.sets, 0),
    volume: Math.round(volume),
    prevVolume: prevVolume == null ? null : Math.round(prevVolume),
    prs: exercises.filter((e) => e.pr).map((e) => e.name),
  };
}

// Facts handed to the AI (and the fallback text when the AI is unavailable).
export function recapFacts(r: Recap): string[] {
  const out = r.exercises.map((e) => {
    const now = `${e.top.weight} lb × ${e.top.reps}`;
    if (!e.prev) return `${e.name}: ${e.sets} sets, top ${now} (first time logged)`;
    const d = e.top.weight - e.prev.weight;
    return `${e.name}: ${e.sets} sets, top ${now} (last time ${e.prev.weight} × ${e.prev.reps}${d ? `, ${d > 0 ? '+' : ''}${d} lb` : ''})${e.pr ? ' — NEW PR' : ''}`;
  });
  out.push(`Total: ${r.sets} sets, ${r.volume.toLocaleString()} lb volume${r.prevVolume ? ` (previous session ${r.prevVolume.toLocaleString()} lb)` : ''}.`);
  return out;
}

export function fallbackRecap(first: string, r: Recap): string {
  const wins = r.prs.length ? `New PR on ${r.prs.join(' and ')}! ` : '';
  const up = r.exercises.filter((e) => e.prev && e.top.weight > e.prev.weight).map((e) => e.name);
  return `Great session today, ${first}. ${wins}${r.sets} sets, ${r.volume.toLocaleString()} lb moved${up.length ? ` — heavier than last time on ${up.join(', ')}` : ''}. Keep it up for next time!`;
}
