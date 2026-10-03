import type { TraineeWorkout } from './coachData';
import type { PlanSplit } from '../config/planSplits';
import { getWorkoutDisplayTitle, isWorkoutUnnamed } from './workoutTitle';

// Pure builders for the Assign sheet's starting points. Each returns a plan
// draft the builder loads as-is, so a coach can send it without typing.
export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = 10;
export const DEFAULT_REST = 90;

export interface StarterRow { name: string; sets: number; reps: number; weight: number; rest: number; note: string; }
export interface StarterDay { label: string; rows: StarterRow[]; }
export interface PlanStarter { title: string; days: StarterDay[]; }
export type LastSetFor = (name: string) => { weight: number; reps: number } | null;

const DAY_MS = 86_400_000;

export function lastSetLookup(workouts: TraineeWorkout[]): LastSetFor {
  const ordered = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  return (name) => {
    const lower = name.toLowerCase();
    for (const w of ordered) {
      const rows = (w.exercises || []).filter((e) => e.name.toLowerCase() === lower);
      if (rows.length) {
        const top = rows.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
        return { weight: Math.round(top.weight), reps: top.reps };
      }
    }
    return null;
  };
}

export function starterFromSplit(split: PlanSplit, lastSetFor: LastSetFor): PlanStarter {
  return {
    title: split.name,
    days: split.days.map((d) => ({
      label: d.label,
      rows: d.exercises.map((name) => ({
        name, sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: lastSetFor(name)?.weight ?? 0, rest: DEFAULT_REST, note: '',
      })),
    })),
  };
}

export function starterFromRecent(workouts: TraineeWorkout[], traineeName: string, now: number = Date.now()): PlanStarter | null {
  const recent = workouts
    .filter((w) => (w.exercises?.length ?? 0) > 0 && now - new Date(`${w.date}T00:00:00`).getTime() < 14 * DAY_MS)
    .sort((a, b) => a.date.localeCompare(b.date));
  // One day per distinct exercise set; a repeat moves to the end (latest wins).
  const byKey = new Map<string, TraineeWorkout>();
  for (const w of recent) {
    const key = [...new Set(w.exercises.map((e) => e.name.toLowerCase()))].sort().join('|');
    byKey.delete(key);
    byKey.set(key, w);
  }
  const picked = [...byKey.values()].slice(-4);
  if (!picked.length) return null;

  const used = new Set<string>();
  const days = picked.map((w, i) => {
    let label = picked.length === 1 ? '' : isWorkoutUnnamed(w) ? `Day ${i + 1}` : getWorkoutDisplayTitle(w);
    if (label && used.has(label.toLowerCase())) label = `${label} ${i + 1}`;
    used.add(label.toLowerCase());
    const order: string[] = [];
    const sets = new Map<string, { weight: number; reps: number }[]>();
    for (const e of w.exercises) {
      if (!sets.has(e.name)) { sets.set(e.name, []); order.push(e.name); }
      sets.get(e.name)!.push({ weight: e.weight, reps: e.reps });
    }
    return {
      label,
      rows: order.map((name) => {
        const list = sets.get(name)!;
        const top = list.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
        return { name, sets: list.length, reps: top.reps || DEFAULT_REPS, weight: Math.round(top.weight), rest: DEFAULT_REST, note: '' };
      }),
    };
  });
  return { title: `${traineeName}'s program`, days };
}

export function starterFromTemplate(t: { title?: string | null; template_exercises?: { name: string; default_sets?: number | null; default_reps?: number | null; default_weight?: number | null }[] }): PlanStarter {
  return {
    title: t.title || 'Template',
    days: [{
      label: '',
      rows: (t.template_exercises ?? []).map((e) => ({
        name: e.name, sets: e.default_sets || DEFAULT_SETS, reps: e.default_reps || DEFAULT_REPS, weight: e.default_weight || 0, rest: DEFAULT_REST, note: '',
      })),
    }],
  };
}
