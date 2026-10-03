import type { ExerciseEntry, WorkoutState } from '../pages/Log';

// Pure checklist operations for the Home "Today's session" card. They act on
// the same WorkoutState the full logger uses, so a tick here is a tick there.

type WorkoutSet = ExerciseEntry['sets'][number];

const filled = (s: WorkoutSet): WorkoutSet => ({
  ...s,
  weight: s.weight ?? s.planned_weight ?? null,
  reps: s.reps ?? s.planned_reps ?? null,
});

const mapExercise = (w: WorkoutState, exerciseId: string, fn: (e: ExerciseEntry) => ExerciseEntry): WorkoutState => ({
  ...w,
  exercises: w.exercises.map((e) => (e.id === exerciseId ? fn(e) : e)),
});

export const exerciseDone = (e: ExerciseEntry) => e.sets.length > 0 && e.sets.every((s) => s.done);

export function sessionProgress(w: WorkoutState) {
  return {
    done: w.exercises.filter(exerciseDone).length,
    total: w.exercises.length,
    nextIndex: w.exercises.findIndex((e) => !exerciseDone(e)),
    anySetDone: w.exercises.some((e) => e.sets.some((s) => s.done)),
  };
}

export const markExerciseDone = (w: WorkoutState, exerciseId: string) =>
  mapExercise(w, exerciseId, (e) => ({ ...e, sets: e.sets.map((s) => ({ ...filled(s), done: true })) }));

export const markExerciseUndone = (w: WorkoutState, exerciseId: string) =>
  mapExercise(w, exerciseId, (e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) }));

export const toggleSetDone = (w: WorkoutState, exerciseId: string, setId: string) =>
  mapExercise(w, exerciseId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...filled(s), done: !s.done } : s)),
  }));

export const updateSetValue = (w: WorkoutState, exerciseId: string, setId: string, field: 'weight' | 'reps', value: number) =>
  mapExercise(w, exerciseId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, [field]: Math.max(0, value) } : s)),
  }));

export const addSet = (w: WorkoutState, exerciseId: string, newId: string) =>
  mapExercise(w, exerciseId, (e) => {
    const last = e.sets[e.sets.length - 1];
    return {
      ...e,
      sets: [...e.sets, {
        id: newId,
        weight: last ? (last.weight ?? last.planned_weight ?? null) : null,
        reps: last ? (last.reps ?? last.planned_reps ?? null) : null,
        done: false,
        planned_weight: last?.planned_weight ?? null,
        planned_reps: last?.planned_reps ?? null,
      }],
    };
  });

export const removeSet = (w: WorkoutState, exerciseId: string, setId: string) =>
  mapExercise(w, exerciseId, (e) => (e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((s) => s.id !== setId) }));

export const addExercises = (w: WorkoutState, entries: ExerciseEntry[]): WorkoutState => {
  const have = new Set(w.exercises.map((e) => e.name.trim().toLowerCase()));
  const fresh = entries.filter((e) => {
    const key = e.name.trim().toLowerCase();
    if (have.has(key)) return false;
    have.add(key);
    return true;
  });
  return { ...w, exercises: [...w.exercises, ...fresh] };
};

// "3 × 10 @ 135 lb" when every set matches, else "135×10 · 135×8 · 125×8".
export function exerciseSummary(e: ExerciseEntry): string {
  const vals = e.sets.map((s) => ({ w: Number(s.weight ?? s.planned_weight ?? 0), r: Number(s.reps ?? s.planned_reps ?? 0) }));
  if (!vals.length) return 'No sets';
  const same = vals.every((v) => v.w === vals[0].w && v.r === vals[0].r);
  if (same) return `${vals.length} × ${vals[0].r}${vals[0].w ? ` @ ${vals[0].w} lb` : ''}`;
  return vals.map((v) => (v.w ? `${v.w}×${v.r}` : `${v.r}`)).join(' · ');
}
