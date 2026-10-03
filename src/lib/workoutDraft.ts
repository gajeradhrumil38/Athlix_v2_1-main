import type { ExerciseEntry, WorkoutState } from '../pages/Log';
import { OPENTRAINING_ASSETS_BY_ID, OPENTRAINING_ID_BY_NAME, normalizeExerciseName } from '../data/opentrainingCatalog';
import { convertWeight } from './units';
import { planStartState, type AssignedPlan } from './assignedPlans';
import { confirmDialog } from '../components/shared/ConfirmDialog';

// The one in-progress workout, shared by the full logger (/log) and the Home
// "Today's session" card. localStorage (not sessionStorage) so it survives the
// phone closing the app mid-gym; a change event lets an open Home re-render.
const DRAFT_KEY = 'athlix_active_workout';
const DRAFT_TTL = 8 * 60 * 60 * 1000;
export const DRAFT_EVENT = 'athlix:workout-draft';

const pad2 = (v: number) => v.toString().padStart(2, '0');
const toLocalDateTimeInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const parseDateTimeInput = (value?: string) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const notify = () => { try { window.dispatchEvent(new Event(DRAFT_EVENT)); } catch { /* ignore */ } };

const removeStored = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
};

// Drafts written before the move to localStorage are picked up once.
const readStored = (): string | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return raw;
    const legacy = sessionStorage.getItem(DRAFT_KEY);
    if (legacy) {
      localStorage.setItem(DRAFT_KEY, legacy);
      sessionStorage.removeItem(DRAFT_KEY);
    }
    return legacy;
  } catch { return null; }
};

export const readDraft = (): WorkoutState | null => {
  try {
    const raw = readStored();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutState;
    if (!parsed || typeof parsed.startTime !== 'number' || !Number.isFinite(parsed.startTime) || !Array.isArray(parsed.exercises)) {
      removeStored();
      return null;
    }
    if (Date.now() - parsed.startTime >= DRAFT_TTL) {
      removeStored();
      return null;
    }
    const baseStart = new Date(parsed.startTime || Date.now());
    const startAt = parsed.startAt || toLocalDateTimeInput(baseStart);
    const endAt = parsed.endAt || toLocalDateTimeInput(new Date(baseStart.getTime() + (parsed.elapsedSeconds || 0) * 1000));
    const startDate = parseDateTimeInput(startAt) || baseStart;
    const endDate = parseDateTimeInput(endAt) || startDate;
    const elapsedSeconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000), parsed.elapsedSeconds || 0);
    return { ...parsed, startAt, endAt, elapsedSeconds };
  } catch {
    removeStored();
    return null;
  }
};

export const writeDraft = (draft: WorkoutState) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* keep going in memory */ }
  notify();
};

export const clearDraft = () => {
  removeStored();
  notify();
};

export const draftHasWork = (w: WorkoutState | null) =>
  !!w && w.exercises.some((e) => e.sets.some((s) => s.done || s.weight || s.reps));

export const newWorkoutState = (exercises: ExerciseEntry[] = [], title = ''): WorkoutState => {
  const now = new Date();
  const local = toLocalDateTimeInput(now);
  return { title, startTime: now.getTime(), startAt: local, endAt: local, elapsedSeconds: 0, exercises, notes: '' };
};

// weight is the coach's prescription, always in lb (assigned_plan_exercises.unit).
export type PlanExercise = { name: string; sets: number; reps: string; rest?: number | null; weight?: number | null; note?: string | null };

const planRepTarget = (reps: string): number | null => {
  const m = /(\d+)/.exec(reps || '');
  return m ? Number(m[1]) : null;
};

// Build workout entries from a plan: resolve each exercise's muscle group from
// the catalog (fallback to the plan's primary muscle), N empty sets, with the
// plan's reps and weight seeded as targets.
export function buildEntriesFromPlan(exercises: PlanExercise[], planMuscles?: string[], weightUnit: 'kg' | 'lbs' = 'lbs'): ExerciseEntry[] {
  return exercises.map((ex) => {
    const assetId = OPENTRAINING_ID_BY_NAME[normalizeExerciseName(ex.name)];
    const asset = assetId ? OPENTRAINING_ASSETS_BY_ID[assetId] : undefined;
    // A coach can prescribe up to 20 sets — the old cap of 6 silently trimmed them.
    const nSets = Math.max(1, Math.min(20, Number(ex.sets) || 3));
    const plannedWeight = ex.weight && ex.weight > 0 ? convertWeight(ex.weight, 'lbs', weightUnit) : null;
    return {
      id: crypto.randomUUID(),
      name: ex.name,
      muscleGroup: asset?.muscleGroup || planMuscles?.[0] || 'Core',
      exercise_db_id: asset?.id,
      restSeconds: ex.rest ?? null,
      note: ex.note ?? null,
      sets: Array.from({ length: nSets }, () => ({
        id: crypto.randomUUID(),
        weight: null,
        reps: null,
        done: false,
        planned_reps: planRepTarget(ex.reps),
        planned_weight: plannedWeight,
      })),
    };
  });
}

export function workoutFromPlanDay(plan: AssignedPlan, dayLabel: string): WorkoutState {
  const st = planStartState(plan, dayLabel);
  return {
    ...newWorkoutState(buildEntriesFromPlan(st.recommendedExercises), st.suggestedTitle),
    sourcePlanId: st.sourcePlanId,
    sourcePlanDay: st.sourcePlanDay,
  };
}

// Start a plan day as the in-progress session (Home card). Returns false if
// the trainee chose to keep an unfinished workout instead.
export async function startPlanDayDraft(plan: AssignedPlan, dayLabel: string): Promise<boolean> {
  if (draftHasWork(readDraft()) && !(await confirmDialog({ title: 'Replace your in-progress workout?', message: 'Logged sets in it will be lost.', confirmLabel: 'Replace', danger: true }))) return false;
  writeDraft(workoutFromPlanDay(plan, dayLabel));
  return true;
}
