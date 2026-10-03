import type { ExerciseEntry, WorkoutState } from '../pages/Log';
import type { TraineeDashboard, TraineeWorkout } from './coachData';
import { groupByDay, type AssignedPlan, type AssignedPlanExercise } from './assignedPlans';
import { getExerciseMuscleProfile } from './exerciseMuscles';
import { isWorkoutUnnamed } from './workoutTitle';
import { format } from 'date-fns';
import { saveWorkout } from './supabaseData';
import { resolveEffectiveInputType, type ExerciseInputType } from './exerciseTypes';
import { setsToSave } from './sessionChecklist';
import type { Exercise } from '../components/log/ExercisePicker';

// Starting points for a coach logging a session for a trainee. Shared by the
// start popup on the trainee page and the logger page, so the popup can hand
// over a ready-made session and the logger opens with no loading step.

export type CoachLogStart =
  | { kind: 'resume' }
  | { kind: 'repeat' }
  | { kind: 'plan'; planId: string; day: string }
  | { kind: 'blank' };

export type CoachLogDraft = { workout: WorkoutState; sourcePlanId: string | null; sourcePlanDay?: string | null };

export interface CoachLogSessionSeed {
  workout: WorkoutState;
  sourcePlanId: string | null;
  sourcePlanDay: string | null;
  openPicker: boolean;
}

const uid = () => crypto.randomUUID();
const pad2 = (n: number) => String(n).padStart(2, '0');
const localDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const draftKey = (traineeId: string) => `athlix:coach-log-draft:${traineeId}`;
export const muscleFor = (name: string, stored?: string | null) =>
  stored || getExerciseMuscleProfile(name).primary[0] || 'Core';

export const readCoachDraft = (traineeId: string): CoachLogDraft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(traineeId)) || 'null');
    return d?.workout?.exercises ? d : null;
  } catch { return null; }
};
export const writeCoachDraft = (traineeId: string, draft: CoachLogDraft | null) => {
  try {
    if (draft) localStorage.setItem(draftKey(traineeId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(traineeId));
  } catch { /* ignore */ }
};

export const newWorkout = (exercises: ExerciseEntry[], title = ''): WorkoutState => {
  const now = localDateTime(new Date());
  return { title, startTime: Date.now(), startAt: now, endAt: now, elapsedSeconds: 0, exercises, notes: '' };
};

// Every set of a past session, as-is (weights already lb).
export function entriesFromWorkout(w: TraineeWorkout): ExerciseEntry[] {
  const order: string[] = [];
  const byName = new Map<string, ExerciseEntry>();
  const rows = [...(w.exercises || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  for (const r of rows) {
    let entry = byName.get(r.name);
    if (!entry) {
      entry = { id: uid(), name: r.name, muscleGroup: muscleFor(r.name, r.muscle_group), exercise_db_id: r.exercise_db_id ?? undefined, sets: [] };
      byName.set(r.name, entry);
      order.push(r.name);
    }
    for (let i = 0; i < Math.max(1, Number(r.sets) || 1); i++) {
      entry.sets.push({ id: uid(), weight: r.weight || null, reps: r.reps || null, done: false, planned_weight: r.weight || null, planned_reps: r.reps || null });
    }
  }
  return order.map((n) => byName.get(n)!);
}

// A plan day as prescribed: N sets × reps @ weight, with its rest time.
export function entriesFromPlan(exs: AssignedPlanExercise[]): ExerciseEntry[] {
  return exs.map((e) => ({
    id: uid(),
    name: e.name,
    muscleGroup: muscleFor(e.name, e.muscle_group),
    restSeconds: e.rest_seconds ?? null,
    sets: Array.from({ length: Math.max(1, Math.min(20, e.default_sets || 1)) }, () => ({
      id: uid(),
      weight: e.default_weight || null,
      reps: e.default_reps || null,
      done: false,
      planned_weight: e.default_weight || null,
      planned_reps: e.default_reps || null,
    })),
  }));
}

export interface PlanDayOption { key: string; plan: AssignedPlan; label: string; day: string; exs: AssignedPlanExercise[] }

export function planDayOptions(plans: AssignedPlan[]): PlanDayOption[] {
  return plans.flatMap((p) => {
    const groups = groupByDay(p.exercises);
    return groups.map(([label, exs], i) => ({
      key: `${p.id}-${i}`,
      plan: p,
      label: groups.length > 1 ? `${p.title} — ${label || `Day ${i + 1}`}` : p.title,
      day: groups.length > 1 ? label : '',
      exs,
    }));
  });
}

export function seedSession(start: CoachLogStart, dash: TraineeDashboard, plans: AssignedPlan[], draft: CoachLogDraft | null): CoachLogSessionSeed | null {
  switch (start.kind) {
    case 'resume':
      return draft ? { workout: draft.workout, sourcePlanId: draft.sourcePlanId, sourcePlanDay: draft.sourcePlanDay ?? null, openPicker: false } : null;
    case 'repeat': {
      const last = dash.workouts.shared ? dash.workouts.data[0] : undefined;
      if (!last) return null;
      return {
        workout: newWorkout(entriesFromWorkout(last), isWorkoutUnnamed(last) ? '' : last.title),
        sourcePlanId: last.source_plan_id,
        sourcePlanDay: last.source_plan_id ? (last.source_plan_day ?? null) : null,
        openPicker: false,
      };
    }
    case 'plan': {
      const opt = planDayOptions(plans).find((o) => o.plan.id === start.planId && o.day === start.day);
      if (!opt) return null;
      return { workout: newWorkout(entriesFromPlan(opt.exs), opt.label), sourcePlanId: opt.plan.id, sourcePlanDay: opt.day, openPicker: false };
    }
    case 'blank':
      return { workout: newWorkout([]), sourcePlanId: null, sourcePlanDay: null, openPicker: true };
  }
}

// The trainee's own exercises (newest first) for the picker's Recent tab,
// each carrying its last session's per-set numbers for prefill.
export function traineeRecentExercises(workouts: TraineeWorkout[]): Exercise[] {
  const seen = new Set<string>();
  const out: Exercise[] = [];
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const sameSession = (w.exercises || []).filter((x) => x.name === e.name);
      const top = sameSession.reduce((a, b) => (b.weight > a.weight ? b : a));
      out.push({
        id: `${e.name}-${w.id}`,
        name: e.name,
        muscleGroup: muscleFor(e.name, e.muscle_group),
        exercise_db_id: e.exercise_db_id ?? undefined,
        lastSession: {
          weight: top.weight, reps: top.reps, date: w.date, sets: sameSession.length, unit: 'lbs',
          perSetData: sameSession.map((x) => ({ weight: x.weight, reps: x.reps })),
        },
      });
    }
  }
  return out;
}

// Save a coach-run session to the trainee's log and clear the draft. Throws a
// user-facing message on validation problems.
export async function saveCoachSession(traineeId: string, draft: CoachLogDraft, overrides: Record<string, ExerciseInputType>): Promise<void> {
  const { workout } = draft;
  const items = setsToSave(workout);
  if (!items.length) throw new Error('Add at least one set with weight or reps.');
  const startDate = new Date(workout.startAt);
  const endDate = new Date(workout.endAt);
  const date = format(Number.isNaN(startDate.getTime()) ? new Date() : startDate, 'yyyy-MM-dd');
  if (date > format(new Date(), 'yyyy-MM-dd')) throw new Error("Can't log a session in the future.");
  const spanSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
  const seconds = spanSec > 0 ? spanSec : workout.elapsedSeconds;

  await saveWorkout(traineeId, {
    title: workout.title.trim() || 'Workout',
    date,
    duration_minutes: Math.max(1, Math.round(seconds / 60)),
    notes: workout.notes || null,
    source_plan_id: draft.sourcePlanId,
    source_plan_day: draft.sourcePlanDay ?? null,
    trainee_id: traineeId,
    exercises: items.map(({ exercise, sets }) => {
      const type = resolveEffectiveInputType(exercise.name, overrides);
      const isDistance = type === 'distance_time' || type === 'distance_only';
      const repsOnly = type === 'reps_only' && !exercise.optionalWeight;
      return {
        name: exercise.name,
        muscle_group: exercise.muscleGroup,
        exercise_db_id: exercise.exercise_db_id || null,
        completed_sets: sets.map((s) => ({
          reps: Math.max(0, Math.round(Number(s.reps || 0))),
          weight: repsOnly ? 0 : Math.max(0, Math.min(9999, Number(s.weight || 0))),
          unit: isDistance ? 'km' as const : 'lbs' as const,
          ...(s.rpe ? { rpe: s.rpe } : {}),
        })),
      };
    }),
  });
  writeCoachDraft(traineeId, null);
}
