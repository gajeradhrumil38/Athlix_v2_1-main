# Today's Session Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trainee who taps Start on a coach plan day gets a "Today's session" card on Home. They tick exercises off there (Done, Edit, Add exercise) and can still continue the same session in the full logger.

**Architecture:**
- The card and `/log` share one in-progress workout. It's the logger's existing draft, moved into `src/lib/workoutDraft.ts`, now kept in local storage with a change event.
- Checklist actions are pure functions in `src/lib/sessionChecklist.ts`.
- The plan link moves onto `WorkoutState`, so it survives a resumed session.
- Finish hands off to `/log?finish=1`, which opens the existing finish screen.

**Tech Stack:** React 18 + TS, Vite, Tailwind, framer-motion, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-todays-session-card-design.md`

**Verification commands (used throughout):**
- **Type-check `src/`:** run `npx tsc -p <tmp>/tsconfig.src.json` using the temporary config from the previous plan (Task 13 there). Expected: the 21 pre-existing errors, none in touched files.
- **Tests:** `npm test`, all passing.
- **Build:** `npx vite build --outDir <tmp>/vbuild` succeeds.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/workoutDraft.ts` | create | draft storage (local storage + change event), new workout, plan → entries, plan day → workout, start-on-Home helper |
| `src/lib/sessionChecklist.ts` | create | pure checklist ops + summary text |
| `src/lib/sessionChecklist.test.ts` | create | unit tests |
| `src/pages/Log.tsx` | modify | use the shared draft module, plan link on the workout, save on every change, `?finish=1` |
| `src/lib/assignedPlans.ts` | modify | `planStartState` also carries each exercise's coach note |
| `src/components/home/SessionExerciseRow.tsx` | create | one exercise row with Done / Edit |
| `src/components/home/TodaySessionCard.tsx` | create | the card |
| `src/components/home/HomeTrainingSlot.tsx` | create | show the session card or the coach plan card |
| `src/components/home/CoachPlanCard.tsx` | modify | `onStartDay` prop |
| `src/pages/Home.tsx` | modify | render `HomeTrainingSlot` |
| `src/pages/MyCoach.tsx` | modify | Start creates the session and goes to Home |
| `docs/trainer-dashboard-test-plan.md` | modify | section 11 |

---

### Task 1: `sessionChecklist.ts` (TDD)

**Files:** Create `src/lib/sessionChecklist.ts`; test `src/lib/sessionChecklist.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import type { ExerciseEntry, WorkoutState } from '../pages/Log';
import {
  addExercises, addSet, exerciseDone, exerciseSummary, markExerciseDone, markExerciseUndone,
  removeSet, sessionProgress, toggleSetDone, updateSetValue,
} from './sessionChecklist';

const set = (id: string, over: Partial<ExerciseEntry['sets'][number]> = {}) => ({
  id, weight: null, reps: null, done: false, planned_weight: 135, planned_reps: 10, ...over,
});
const ex = (id: string, name: string, sets = [set(`${id}a`), set(`${id}b`), set(`${id}c`)]): ExerciseEntry =>
  ({ id, name, muscleGroup: 'Chest', sets });
const w = (exercises: ExerciseEntry[]): WorkoutState =>
  ({ title: 'Push', startTime: 0, startAt: '', endAt: '', elapsedSeconds: 0, exercises, notes: '' });

describe('markExerciseDone / Undone', () => {
  it('fills empty values from the prescription and ticks every set', () => {
    const out = markExerciseDone(w([ex('e1', 'Bench Press')]), 'e1');
    expect(out.exercises[0].sets.every((s) => s.done && s.weight === 135 && s.reps === 10)).toBe(true);
  });
  it('keeps values the trainee already entered', () => {
    const out = markExerciseDone(w([ex('e1', 'Bench', [set('a', { weight: 140, reps: 8 })])]), 'e1');
    expect(out.exercises[0].sets[0]).toMatchObject({ weight: 140, reps: 8, done: true });
  });
  it('undo unticks but keeps numbers', () => {
    const done = markExerciseDone(w([ex('e1', 'Bench')]), 'e1');
    const out = markExerciseUndone(done, 'e1');
    expect(out.exercises[0].sets.every((s) => !s.done && s.weight === 135)).toBe(true);
  });
});

describe('sessionProgress', () => {
  it('counts fully done exercises and finds the next one', () => {
    const s = markExerciseDone(w([ex('e1', 'A'), ex('e2', 'B'), ex('e3', 'C')]), 'e1');
    expect(sessionProgress(s)).toEqual({ done: 1, total: 3, nextIndex: 1, anySetDone: true });
  });
  it('treats a partly ticked exercise as not done', () => {
    const s = toggleSetDone(w([ex('e1', 'A')]), 'e1', 'e1a');
    expect(exerciseDone(s.exercises[0])).toBe(false);
    expect(sessionProgress(s)).toEqual({ done: 0, total: 1, nextIndex: 0, anySetDone: true });
  });
  it('reports nextIndex -1 when everything is done', () => {
    const s = markExerciseDone(w([ex('e1', 'A')]), 'e1');
    expect(sessionProgress(s).nextIndex).toBe(-1);
  });
});

describe('set edits', () => {
  it('toggleSetDone fills from the prescription', () => {
    const s = toggleSetDone(w([ex('e1', 'A')]), 'e1', 'e1b');
    expect(s.exercises[0].sets[1]).toMatchObject({ done: true, weight: 135, reps: 10 });
  });
  it('updateSetValue clamps at zero', () => {
    const s = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1a', 'weight', -5);
    expect(s.exercises[0].sets[0].weight).toBe(0);
  });
  it('addSet copies the last set, not done', () => {
    const base = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1c', 'weight', 150);
    const s = addSet(base, 'e1', 'new');
    expect(s.exercises[0].sets).toHaveLength(4);
    expect(s.exercises[0].sets[3]).toMatchObject({ id: 'new', weight: 150, reps: 10, done: false });
  });
  it('removeSet keeps at least one set', () => {
    const one = w([ex('e1', 'A', [set('only')])]);
    expect(removeSet(one, 'e1', 'only').exercises[0].sets).toHaveLength(1);
    expect(removeSet(w([ex('e1', 'A')]), 'e1', 'e1a').exercises[0].sets.map((x) => x.id)).toEqual(['e1b', 'e1c']);
  });
});

describe('addExercises', () => {
  it('appends new exercises and skips names already in the session', () => {
    const s = addExercises(w([ex('e1', 'Bench Press')]), [ex('x', 'bench press'), ex('y', 'Row')]);
    expect(s.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Row']);
  });
});

describe('exerciseSummary', () => {
  it('collapses identical sets', () => {
    expect(exerciseSummary(ex('e1', 'A'))).toBe('3 × 10 @ 135 lb');
  });
  it('lists differing sets', () => {
    const e = ex('e1', 'A', [set('a', { weight: 135, reps: 10 }), set('b', { weight: 135, reps: 8 }), set('c', { weight: 125, reps: 8 })]);
    expect(exerciseSummary(e)).toBe('135×10 · 135×8 · 125×8');
  });
  it('omits weight for bodyweight work', () => {
    const e = ex('e1', 'Push-Ups', [set('a', { planned_weight: null, planned_reps: 15 }), set('b', { planned_weight: null, planned_reps: 15 })]);
    expect(exerciseSummary(e)).toBe('2 × 15');
  });
});
```

- [ ] **Step 2: Run.** Run `npx vitest run src/lib/sessionChecklist.test.ts`. Expected: FAIL, the module can't be resolved.

- [ ] **Step 3: Implement** `src/lib/sessionChecklist.ts`:

```ts
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
```

- [ ] **Step 4: Run.** Run `npx vitest run src/lib/sessionChecklist.test.ts`. Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionChecklist.ts src/lib/sessionChecklist.test.ts
git commit -m "feat(session): pure checklist operations for the Today's session card"
```

---

### Task 2: Shared draft module + Log.tsx on it

**Files:**
- Create: `src/lib/workoutDraft.ts`
- Modify: `src/pages/Log.tsx`
- Modify: `src/lib/assignedPlans.ts` (`planStartState`)

- [ ] **Step 1: Types in `src/pages/Log.tsx`.**
  - In `ExerciseEntry`, after `restSeconds?: number | null;`, add `note?: string | null;` (the coach's cue, shown on the Home card).
  - In `WorkoutState`, after `notes: string;`, add:

```ts
  // The coach plan + day this session was started from. Kept on the workout
  // (not in page memory) so a resumed session — from the Home card or a
  // reload — still saves with its plan link.
  sourcePlanId?: string | null;
  sourcePlanDay?: string | null;
```

- [ ] **Step 2: Carry notes in `planStartState`.** In `src/lib/assignedPlans.ts`, inside `planStartState`'s `recommendedExercises` map, after `weight: e.default_weight || null,`, add `note: e.note ?? null,`.

- [ ] **Step 3: Create `src/lib/workoutDraft.ts`**

```ts
import type { ExerciseEntry, WorkoutState } from '../pages/Log';
import { OPENTRAINING_ASSETS_BY_ID, OPENTRAINING_ID_BY_NAME, normalizeExerciseName } from '../data/opentrainingCatalog';
import { convertWeight } from './units';
import { planStartState, type AssignedPlan } from './assignedPlans';

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
export function startPlanDayDraft(plan: AssignedPlan, dayLabel: string): boolean {
  if (draftHasWork(readDraft()) && !window.confirm('Replace your in-progress workout? Logged sets in it will be lost.')) return false;
  writeDraft(workoutFromPlanDay(plan, dayLabel));
  return true;
}
```

- [ ] **Step 4: Switch Log.tsx to the module.** In `src/pages/Log.tsx`:

  - **Delete** these local definitions:
    - `const DRAFT_KEY = …;` and `const DRAFT_TTL = …;`
    - the `PlanExercise` type, `planRepTarget` and `buildEntriesFromPlan`, with their comment block
    - `readDraft`, `writeDraft` and `clearDraft`

    Keep `pad2`, `toLocalDateTimeInput`, `parseDateTimeInput`, `parseDateParam` and `formatLocalDate`; they're still used.
  - Add the import:

```ts
import { buildEntriesFromPlan, clearDraft, readDraft, writeDraft, type PlanExercise } from '../lib/workoutDraft';
```

  - **Remove** `const sourcePlanIdRef = …` and `const sourcePlanDayRef = …`.
  - In the init effect's plan branch, replace the `planState` lines and the `else` block body with:

```ts
      const planState = location.state as { sourcePlanId?: string; sourcePlanDay?: string } | null;
      const draftHasWork = draft?.exercises?.some((e) => e.sets.length > 0);
      if (draft && draftHasWork) {
        setWorkout(draft);
        setShowQuickStart(false);
        setOpenPickerOnStart(false);
      } else {
        const st = location.state as { suggestedTitle?: string; preselectedMuscles?: string[] } | null;
        const entries = buildEntriesFromPlan(recExercises, st?.preselectedMuscles, weightUnit);
        const state = {
          ...createWorkoutState(entries, st?.suggestedTitle, forcedWorkoutDate),
          sourcePlanId: planState?.sourcePlanId ?? null,
          sourcePlanDay: planState?.sourcePlanDay ?? null,
        };
        setWorkout(state);
        setShowQuickStart(false);
        setOpenPickerOnStart(false);
        writeDraft(state);
      }
```

  - In `handleSave`, replace `source_plan_id: sourcePlanIdRef.current,` and `source_plan_day: sourcePlanDayRef.current,` with:

```ts
        source_plan_id: workout.sourcePlanId ?? null,
        source_plan_day: workout.sourcePlanDay ?? null,
```

  - **Save on every change.** Replace the two effects ("Write draft immediately when exercise count changes" with its `prevExCountRef`, and "Also auto-save every 30s") with:

```ts
  // Save on every change — the Home "Today's session" card reads this same
  // draft, so a set ticked here must be there the moment the user goes back.
  useEffect(() => {
    if (workout) writeDraft(workout);
  }, [workout]);
```

- [ ] **Step 5: `?finish=1`.** In `Log.tsx`:

  - Next to the other `searchParams.get(...)` lines, add `const finishRequested = searchParams.get('finish') === '1';`.
  - Below the `sourcePlan*` area, add `const pendingFinishRef = useRef(false);`.
  - In the init effect's draft-resume branch, inside `if (draftMatchesForcedDate) {`, before `return;`, add:

```ts
        if (finishRequested && draft.exercises.some((e) => e.sets.some((s) => s.done))) pendingFinishRef.current = true;
```

  - Directly after the `handleFinish` function, add:

```ts
  // Home card's "Finish session" lands here as /log?finish=1: resume the
  // shared draft, then open the normal finish flow.
  useEffect(() => {
    if (workout && pendingFinishRef.current) {
      pendingFinishRef.current = false;
      handleFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout]);
```

- [ ] **Step 6: Verify.** Run the type-check (expect only pre-existing errors), `npm test` (expect pass) and the build (expect success).

- [ ] **Step 7: Commit**

```bash
git add src/lib/workoutDraft.ts src/pages/Log.tsx src/lib/assignedPlans.ts
git commit -m "refactor(log): shared workout draft (localStorage + change event), plan link on the workout, ?finish=1"
```

---

### Task 3: `SessionExerciseRow`

**Files:** Create `src/components/home/SessionExerciseRow.tsx`.

- [ ] **Step 1: Create**

```tsx
import React from 'react';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { muscleColor } from '../../lib/muscleColors';
import { exerciseDone, exerciseSummary } from '../../lib/sessionChecklist';
import type { ExerciseEntry } from '../../pages/Log';

// One exercise on the Home "Today's session" card: one tap to mark it done,
// tap the row to adjust individual sets.
interface Props {
  exercise: ExerciseEntry;
  isNext: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onDone: () => void;
  onUndo: () => void;
  onToggleSet: (setId: string) => void;
  onChangeSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
}

export const SessionExerciseRow: React.FC<Props> = ({ exercise, isNext, expanded, onToggleExpand, onDone, onUndo, onToggleSet, onChangeSet, onAddSet, onRemoveSet }) => {
  const done = exerciseDone(exercise);
  const ticked = exercise.sets.filter((s) => s.done).length;
  const color = muscleColor(exercise.muscleGroup);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: `1px solid ${isNext ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)'}`, opacity: done && !expanded ? 0.62 : 1 }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-3 pl-4 pr-3 py-3">
        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-[var(--text-primary)] truncate" style={done ? { textDecoration: 'line-through' } : undefined}>{exercise.name}</p>
            {isNext && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: 'var(--accent)', color: '#000' }}>Up next</span>}
          </div>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>{exercise.muscleGroup}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 tabular-nums">
            {exerciseSummary(exercise)}{ticked > 0 && !done ? ` · ${ticked}/${exercise.sets.length} sets` : ''}
          </p>
          {exercise.note && <p className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--accent)' }}>{exercise.note}</p>}
        </button>
        <button
          type="button"
          onClick={() => { haptics.tick(); if (done) { onUndo(); } else { onDone(); } }}
          aria-label={done ? `Undo ${exercise.name}` : `Mark ${exercise.name} done`}
          className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center transition-colors"
          style={done ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1.5px solid var(--border)' }}
        >
          <AppIcon name="Check" size="md" />
        </button>
      </div>

      {expanded && (
        <div className="pl-4 pr-3 pb-3 space-y-1.5">
          {exercise.sets.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-[12px] font-bold text-[var(--text-muted)]">{i + 1}</span>
              <Stepper value={s.weight ?? s.planned_weight ?? 0} suffix="lb" step={5} onChange={(v) => onChangeSet(s.id, 'weight', v)} />
              <Stepper value={s.reps ?? s.planned_reps ?? 0} suffix="reps" step={1} onChange={(v) => onChangeSet(s.id, 'reps', v)} />
              <button type="button" onClick={() => onToggleSet(s.id)} aria-label={`Set ${i + 1} done`}
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
                style={s.done ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <AppIcon name="Check" size="sm" />
              </button>
              <button type="button" onClick={() => onRemoveSet(s.id)} disabled={exercise.sets.length <= 1} aria-label={`Remove set ${i + 1}`}
                className="shrink-0 h-8 w-6 flex items-center justify-center disabled:opacity-25" style={{ color: '#ff8080' }}>
                <AppIcon name="Close" size="sm" />
              </button>
            </div>
          ))}
          <button type="button" onClick={onAddSet} className="text-[12px] font-semibold text-[var(--accent)] pl-7 pt-1">+ Set</button>
        </div>
      )}
    </div>
  );
};

const Stepper: React.FC<{ value: number; suffix: string; step: number; onChange: (v: number) => void }> = ({ value, suffix, step, onChange }) => (
  <div className="flex-1 min-w-0 flex items-center h-8 rounded-lg overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
    <button type="button" onClick={() => onChange(Math.max(0, value - step))} className="w-7 h-full text-[16px] text-[var(--text-muted)]">−</button>
    <span className="flex-1 text-center text-[13px] font-bold tabular-nums text-[var(--text-primary)] truncate">{value}<span className="text-[10px] font-medium text-[var(--text-muted)] ml-0.5">{suffix}</span></span>
    <button type="button" onClick={() => onChange(value + step)} className="w-7 h-full text-[16px]" style={{ color: 'var(--accent)' }}>+</button>
  </div>
);
```

- [ ] **Step 2: Type-check.** Expected: no new errors. (`Check` and `Close` icons exist in the registry.)

- [ ] **Step 3: Commit**

```bash
git add src/components/home/SessionExerciseRow.tsx
git commit -m "feat(session): exercise row with one-tap Done and per-set edit"
```

---

### Task 4: `TodaySessionCard` + `HomeTrainingSlot` + wiring

**Files:**
- Create: `src/components/home/TodaySessionCard.tsx`
- Create: `src/components/home/HomeTrainingSlot.tsx`
- Modify: `src/components/home/CoachPlanCard.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/MyCoach.tsx`

- [ ] **Step 1: `TodaySessionCard.tsx`**

```tsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { useAuth } from '../../contexts/AuthContext';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { getLastExerciseSession } from '../../lib/supabaseData';
import { readDraft } from '../../lib/workoutDraft';
import type { ExerciseEntry, WorkoutState } from '../../pages/Log';
import {
  addExercises, addSet, markExerciseDone, markExerciseUndone, removeSet, sessionProgress, toggleSetDone, updateSetValue,
} from '../../lib/sessionChecklist';
import { SessionExerciseRow } from './SessionExerciseRow';

interface Props {
  workout: WorkoutState;
  onChange: (next: WorkoutState) => void;
  onDiscard: () => void;
  onOpenLogger: () => void;
  onFinish: () => void;
}

const uid = () => crypto.randomUUID();

// Sets for a newly added exercise, from its last session when the picker knows it.
const setsFrom = (ex: Exercise): ExerciseEntry['sets'] => {
  const per = ex.lastSession?.perSetData;
  if (per?.length) return per.map((s) => ({ id: uid(), weight: s.weight || null, reps: s.reps || null, done: false, planned_weight: s.weight || null, planned_reps: s.reps || null }));
  const n = Math.max(1, Math.min(10, ex.lastSession?.sets || 3));
  const w = ex.lastSession?.weight || null;
  const r = ex.lastSession?.reps || null;
  return Array.from({ length: n }, () => ({ id: uid(), weight: w, reps: r, done: false, planned_weight: w, planned_reps: r }));
};

// Home "Today's session": the in-progress workout as a tick-off list. Same
// draft as the full logger, so either can continue or finish it.
export const TodaySessionCard: React.FC<Props> = ({ workout, onChange, onDiscard, onOpenLogger, onFinish }) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const p = sessionProgress(workout);

  const addPicked = (picked: Exercise) => {
    const entry: ExerciseEntry = { id: uid(), name: picked.name, muscleGroup: picked.muscleGroup, exercise_db_id: picked.exercise_db_id, sets: setsFrom(picked) };
    onChange(addExercises(workout, [entry]));
    // Catalog picks carry no history — fill from the trainee's last session.
    // Re-read the draft when it arrives (the card may have changed since) and
    // only replace this exercise's sets if they're still untouched.
    if (!picked.lastSession && user) {
      getLastExerciseSession(user.id, picked.name).then((res) => {
        const last = res?.lastSession as Exercise['lastSession'] | undefined;
        const current = readDraft();
        if (!last || !current) return;
        onChange({
          ...current,
          exercises: current.exercises.map((e) =>
            e.id === entry.id && e.sets.every((s) => !s.done) ? { ...e, sets: setsFrom({ ...picked, lastSession: last }) } : e),
        });
      }).catch(() => { /* keep defaults */ });
    }
  };

  return (
    <div className="glass-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Today&apos;s session</p>
          <p className="text-[18px] font-bold text-[var(--text-primary)] leading-tight truncate mt-0.5">{workout.title || 'Workout'}</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {p.done} of {p.total} done · started {formatDistanceToNowStrict(new Date(workout.startTime), { addSuffix: true })}
          </p>
        </div>
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Session options"
          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[18px] leading-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>⋯</button>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%`, background: 'var(--accent)' }} />
      </div>

      {menu && (
        <div className="mt-3 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
          <button type="button" onClick={() => { setMenu(false); onOpenLogger(); }} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)]">Open full logger</button>
          <button type="button" onClick={() => { setMenu(false); onDiscard(); }} className="w-full px-4 py-3 text-left text-[14px] font-semibold" style={{ color: '#ff8080' }}>Discard session</button>
        </div>
      )}

      <div className="mt-3 max-h-[420px] overflow-y-auto space-y-2 -mx-1 px-1">
        {workout.exercises.map((ex, i) => (
          <SessionExerciseRow
            key={ex.id}
            exercise={ex}
            isNext={i === p.nextIndex}
            expanded={expanded === ex.id}
            onToggleExpand={() => setExpanded(expanded === ex.id ? null : ex.id)}
            onDone={() => onChange(markExerciseDone(workout, ex.id))}
            onUndo={() => onChange(markExerciseUndone(workout, ex.id))}
            onToggleSet={(setId) => onChange(toggleSetDone(workout, ex.id, setId))}
            onChangeSet={(setId, field, value) => onChange(updateSetValue(workout, ex.id, setId, field, value))}
            onAddSet={() => onChange(addSet(workout, ex.id, uid()))}
            onRemoveSet={(setId) => onChange(removeSet(workout, ex.id, setId))}
          />
        ))}
      </div>

      <button type="button" onClick={() => setPicking(true)}
        className="w-full h-11 mt-2 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
        style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
        <AppIcon name="Plus" size="sm" /> Add exercise
      </button>
      <button type="button" onClick={onFinish} disabled={!p.anySetDone}
        className="w-full h-12 mt-2 rounded-2xl font-bold text-[15px] disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#000' }}>
        {p.total > 0 && p.done === p.total ? 'Finish session ✓' : 'Finish session'}
      </button>

      {/* Portal: the card's glass background would otherwise trap the
          full-screen picker inside the card. */}
      {picking && createPortal(
        <ExercisePicker recentExercises={[]} multiSelect onSelect={addPicked} onClose={() => setPicking(false)} />,
        document.body,
      )}
    </div>
  );
};
```

- [ ] **Step 2: `HomeTrainingSlot.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearDraft, DRAFT_EVENT, readDraft, startPlanDayDraft, writeDraft } from '../../lib/workoutDraft';
import type { WorkoutState } from '../../pages/Log';
import { CoachPlanCard } from './CoachPlanCard';
import { TodaySessionCard } from './TodaySessionCard';

// Top of Home: an in-progress session as a tick-off card, otherwise the coach
// plan card whose Start begins that session right here.
export const HomeTrainingSlot: React.FC = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<WorkoutState | null>(() => readDraft());

  useEffect(() => {
    const sync = () => setDraft(readDraft());
    window.addEventListener(DRAFT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DRAFT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (draft && draft.exercises.length > 0) {
    return (
      <TodaySessionCard
        workout={draft}
        onChange={(next) => { setDraft(next); writeDraft(next); }}
        onDiscard={() => { if (window.confirm('Discard this session? Nothing will be saved.')) clearDraft(); }}
        onOpenLogger={() => navigate('/log')}
        onFinish={() => navigate('/log?finish=1')}
      />
    );
  }
  return <CoachPlanCard onStartDay={(plan, day) => { startPlanDayDraft(plan, day); }} />;
};
```

- [ ] **Step 3: `CoachPlanCard` gets `onStartDay`.** In `src/components/home/CoachPlanCard.tsx`:
  - Change the signature to `export const CoachPlanCard: React.FC<{ onStartDay?: (plan: AssignedPlan, day: string) => void }> = ({ onStartDay }) => {`.
  - Replace the `onStart={(day) => navigate('/log', { state: planStartState(plan, day) })}` prop with:

```tsx
        onStart={(day) => (onStartDay ? onStartDay(plan, day) : navigate('/log', { state: planStartState(plan, day) }))}
```

- [ ] **Step 4: Home.** In `src/pages/Home.tsx`, replace `import { CoachPlanCard } from '../components/home/CoachPlanCard';` with `import { HomeTrainingSlot } from '../components/home/HomeTrainingSlot';`, and replace `<CoachPlanCard />` with `<HomeTrainingSlot />`.

- [ ] **Step 5: My Coach starts on Home.** In `src/pages/MyCoach.tsx`:
  - Change the `assignedPlans` import to drop `planStartState`.
  - Add `import { startPlanDayDraft } from '../lib/workoutDraft';`.
  - Replace the `start` function with:

```ts
  const start = (plan: AssignedPlan, dayLabel: string) => {
    if (startPlanDayDraft(plan, dayLabel)) navigate('/');
  };
```

- [ ] **Step 6: Verify.** Run the type-check, `npm test` and the build. Then lint the new and changed files with `npx eslint --no-ignore <files>`. Expected: clean apart from pre-existing `no-unescaped-entities` / `exhaustive-deps` items, and replace any `'` in JSX text with `&apos;`.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/TodaySessionCard.tsx src/components/home/HomeTrainingSlot.tsx src/components/home/CoachPlanCard.tsx src/pages/Home.tsx src/pages/MyCoach.tsx
git commit -m "feat(home): Today's session card — start a plan day on Home and tick exercises off"
```

---

### Task 5: Test plan section 11

**Files:** Modify `docs/trainer-dashboard-test-plan.md`. Insert before "## Known gaps".

- [ ] **Step 1: Add**

```markdown
## 11. Today's session card (trainee Home)

| ID | Steps | Expected |
|---|---|---|
| TS-1 | Trainee with a coach plan taps Start on the "From your coach" card | Stays on Home; the coach card is replaced by "Today's session" with the day's exercises, "0 of N done", the first row marked Up next. |
| TS-2 | Tap ✓ on the first exercise | Every set ticked at the prescribed numbers; the row dims and strikes through; progress bar and "1 of N done" update; Up next moves down. |
| TS-3 | Tap ✓ again | Undone; numbers kept. |
| TS-4 | Tap a row → change set 2 to 140 lb × 8, tick it | Summary shows the differing sets ("135×10 · 140×8 · 135×10"), "1/3 sets". |
| TS-5 | + Set / × on a set | Adds a copy of the last set / removes it (can't remove the last one). |
| TS-6 | Add exercise → pick two | Both appear at the bottom, prefilled from the trainee's last session where they have one. |
| TS-7 | ⋯ → Open full logger | The logger shows the same exercises and ticks. Tick another set there, go back to Home → the card shows it. |
| TS-8 | Finish session (after ticking some) | The logger opens straight onto the finish screen; saving shows the celebration; back on Home the card is gone, and the coach card shows that day done and the next day suggested. |
| TS-9 | Finish with nothing ticked | Button disabled. |
| TS-10 | ⋯ → Discard session → confirm | Card disappears; nothing saved; the coach card is back. |
| TS-11 | Start a day while a session with ticked sets exists | Confirm "Replace your in-progress workout?"; Cancel keeps the old one. |
| TS-12 | Start a session, fully close the app, reopen | The card is still there with its ticks (localStorage). |
| TS-13 | My Coach → Start a day | Goes to Home with that day as Today's session. |
| TS-14 | Start a normal workout in /log, add an exercise, go to Home | The card shows it (Resume via Open full logger). |
```

- [ ] **Step 2: Commit**

```bash
git add docs/trainer-dashboard-test-plan.md
git commit -m "docs(test-plan): Today's session card cases"
```
