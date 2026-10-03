# Coach Session Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the trainee page's Overview, the coach sees the trainee's next plan day and can run an in-person session as a tick-off card. The card shares its draft with the full coach logger, and Finish saves the session to the trainee's log.

**Architecture:**
- Reuse the trainee-side `TodaySessionCard` (made configurable through props) and `CoachPlanCardView` (new `eyebrow` prop).
- Store the session in the coach's existing per-trainee draft (`lib/coachLog.ts`).
- Move the coach save logic (`setsToSave`, `saveCoachSession`), the review dialog and the trainee's recent-exercise list into shared units, so the card and `CoachLogSession` can't drift apart.

**Tech Stack:** React 18 + TS, Vite, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-coach-session-card-design.md`

**Verification (every task):**
- Type-check `src/` with the temporary config. Expected: only the 21 pre-existing errors.
- `npm test` passes.
- `npx vite build` succeeds.
- `npx eslint --no-ignore <changed files>` shows no new problems.

---

### Task 1: `setsToSave` into `sessionChecklist` + coach-side rotation test (TDD)

**Files:**
- Modify: `src/lib/sessionChecklist.ts`
- Modify: `src/lib/sessionChecklist.test.ts`
- Modify: `src/lib/planProgress.test.ts`

- [ ] **Step 1: Failing tests.** In `src/lib/sessionChecklist.test.ts`, add `setsToSave` to the import list from `./sessionChecklist`, and append:

```ts
describe('setsToSave', () => {
  it('saves only ticked sets once any set is ticked', () => {
    const s = toggleSetDone(w([ex('e1', 'A'), ex('e2', 'B')]), 'e1', 'e1a');
    const out = setsToSave(s);
    expect(out.map((x) => x.exercise.name)).toEqual(['A']);
    expect(out[0].sets.map((x) => x.id)).toEqual(['e1a']);
  });
  it('saves every set with a value when nothing is ticked', () => {
    const s = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1a', 'weight', 100);
    expect(setsToSave(s)[0].sets.map((x) => x.id)).toEqual(['e1a']);
  });
  it('drops exercises with no values', () => {
    expect(setsToSave(w([ex('e1', 'A')]))).toEqual([]);
  });
});
```

In `src/lib/planProgress.test.ts`, add `import type { TraineeWorkout } from './coachData';` and, inside `describe('planProgress', …)`, add:

```ts
  it('accepts trainee workouts exactly as the coach loads them', () => {
    const tw: TraineeWorkout = {
      id: 'w1', date: '2026-10-01', created_at: null, title: 'Push', duration_minutes: 40, muscle_groups: [],
      source_plan_id: 'p1', source_plan_day: 'Push',
      exercises: [{ name: 'Bench Press', muscle_group: null, sets: 1, reps: 5, weight: 135, unit: 'lbs' }],
    };
    expect(planProgress(ppl, [tw], NOW).nextDay).toBe('Pull');
  });
```

- [ ] **Step 2: Run.** `npx vitest run`. Expected: FAIL, `setsToSave` is not exported.

- [ ] **Step 3: Implement.** Append to `src/lib/sessionChecklist.ts`:

```ts
// What a coach save writes. If any set is ticked, the coach is marking what
// was done — save only ticked sets (same rule as the athlete's logger).
// Otherwise every set with a value counts, so logging after the fact doesn't
// require ticking each set.
export function setsToSave(workout: WorkoutState) {
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done));
  return workout.exercises
    .map((exercise, index) => ({
      exercise,
      index,
      sets: exercise.sets.filter((s) => (anyDone ? s.done : true) && (Number(s.weight || 0) > 0 || Number(s.reps || 0) > 0)),
    }))
    .filter((x) => x.sets.length > 0);
}
```

- [ ] **Step 4: Run.** `npx vitest run`. Expected: PASS (40 tests).
- [ ] **Step 5: Commit.** `git commit -m "feat(session): shared setsToSave; coach-side rotation test"`

---

### Task 2: Shared coach save, recent exercises, and review dialog

**Files:**
- Modify: `src/lib/coachLog.ts`
- Create: `src/components/coach/CoachSessionReview.tsx`
- Modify: `src/pages/CoachLogSession.tsx`

- [ ] **Step 1: `lib/coachLog.ts`.** Add these imports:

```ts
import { format } from 'date-fns';
import { saveWorkout } from './supabaseData';
import { resolveEffectiveInputType, type ExerciseInputType } from './exerciseTypes';
import { setsToSave } from './sessionChecklist';
import type { Exercise } from '../components/log/ExercisePicker';
```

Then append:

```ts
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
        })),
      };
    }),
  });
  writeCoachDraft(traineeId, null);
}
```

- [ ] **Step 2: `CoachSessionReview.tsx`**

```tsx
import React from 'react';
import { format } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { CenterModal } from '../shared/CenterModal';
import { setsToSave } from '../../lib/sessionChecklist';
import type { WorkoutState } from '../../pages/Log';

// "Save to <name>'s log" review — shared by the coach Overview card and the
// full coach logger so both save the same way.
interface Props {
  open: boolean;
  onClose: () => void;
  traineeName: string;
  workout: WorkoutState;
  onTitle: (title: string) => void;
  saving: boolean;
  onSave: () => void;
}

export const CoachSessionReview: React.FC<Props> = ({ open, onClose, traineeName, workout, onTitle, saving, onSave }) => {
  const items = open ? setsToSave(workout) : [];
  const totalSets = items.reduce((n, x) => n + x.sets.length, 0);
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done));
  return (
    <CenterModal open={open} onClose={onClose} zIndex={60}>
      <div className="p-6 overflow-y-auto">
        <h2 className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">Save to {traineeName}&apos;s log</h2>
        <p className="text-[14px] text-[var(--text-secondary)] mt-1">
          {format(new Date(workout.startAt), 'EEE, MMM d')} · {items.length} exercise{items.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
        </p>
        <input value={workout.title} onChange={(e) => onTitle(e.target.value)} placeholder="Session name (optional)"
          className="w-full h-12 rounded-2xl px-4 mt-4 text-[15px] font-semibold outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
        <div className="mt-3 max-h-[36vh] overflow-y-auto rounded-2xl divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
          {items.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-[var(--text-muted)]">No sets with weight or reps yet.</p>
          ) : items.map(({ exercise, sets }) => (
            <div key={exercise.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{exercise.name}</p>
              <p className="text-[12px] text-[var(--text-muted)] shrink-0 tabular-nums">
                {sets.map((s) => (s.weight ? `${s.weight}×${s.reps ?? 0}` : `${s.reps ?? 0}`)).join(' · ')}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mt-2">
          {anyDone ? 'Only ticked sets are saved.' : 'Every set with a value is saved — tick sets to save only those.'} Weights in lb.
        </p>
        <button type="button" disabled={saving || items.length === 0} onClick={onSave}
          className="w-full h-13 py-3.5 mt-4 rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#000' }}>
          {saving ? <AppIcon name="Spinner" size="md" /> : 'Save session'}
        </button>
        <button type="button" disabled={saving} onClick={onClose} className="w-full h-11 mt-2 rounded-2xl text-[14px] font-semibold text-[var(--text-secondary)]">
          Keep editing
        </button>
      </div>
    </CenterModal>
  );
};
```

- [ ] **Step 3: `CoachLogSession.tsx` uses the shared pieces.**
  - Delete its local `setsToSave` function, its `recentExercises` `useMemo` body and its inline `<CenterModal …>` review.
  - Import `saveCoachSession` and `traineeRecentExercises` from `../lib/coachLog`, plus `CoachSessionReview`.
  - Set `const recentExercises = useMemo(() => traineeRecentExercises(workouts), [workouts]);`.
  - Replace `save` with:

```ts
  const save = async () => {
    if (!workout || !dash) return;
    setSaving(true);
    try {
      await saveCoachSession(id, { workout, sourcePlanId, sourcePlanDay }, overrides);
      void getTraineeDashboard(id);
      toast.success(`Saved to ${dash.name}'s log`);
      goBack();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };
```

  - Render the review as:

```tsx
        <CoachSessionReview open={reviewing} onClose={() => !saving && setReviewing(false)} traineeName={dash.name}
          workout={workout} onTitle={(title) => setWorkout((p) => (p ? { ...p, title } : p))} saving={saving} onSave={save} />
```

  - Remove now-unused imports: `format`, `CenterModal`, `resolveEffectiveInputType`, `saveWorkout`, `muscleFor` and the `Exercise` type.

- [ ] **Step 4: Verify** (type-check, tests, build, lint) and **commit**: `git commit -m "refactor(coach): shared coach save, recent exercises and review dialog"`

---

### Task 3: Make the shared cards configurable

**Files:**
- Modify: `src/components/home/TodaySessionCard.tsx`
- Modify: `src/components/home/CoachPlanCardView.tsx`
- Modify: `src/components/coach/CoachLogStart.tsx`

- [ ] **Step 1: `TodaySessionCard` props.** Extend `Props` with:

```ts
  // Coach-run sessions: a different heading, prefill from the trainee's
  // history, the trainee's recent exercises, and re-reading the coach draft.
  label?: string;
  historyUserId?: string;
  recentExercises?: Exercise[];
  readCurrent?: () => WorkoutState | null;
```

Then:
- Destructure them.
- In `addPicked`, replace `getLastExerciseSession(user.id, …)` with `getLastExerciseSession(historyUserId ?? user.id, …)` and `const current = readDraft();` with `const current = (readCurrent ?? readDraft)();`.
- Replace the eyebrow `Today&apos;s session` with `{label ?? <>Today&apos;s session</>}`.
- Pass `recentExercises={recentExercises ?? []}` to the picker.
- Below the list `div`, add an empty state for blank starts:

```tsx
      {workout.exercises.length === 0 && (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-4">No exercises yet — add what you&apos;re doing.</p>
      )}
```

- [ ] **Step 2: `CoachPlanCardView` eyebrow.** Add `eyebrow?: string;` to `Props`, destructure it, and replace `From {coachName || 'your coach'}` with `{eyebrow ?? `From ${coachName || 'your coach'}`}`.

- [ ] **Step 3: `CoachLogStartModal` onPick.** Add `onPick?: (start: CoachLogStart) => void` to `ModalProps`, destructure it as `onPick: onPickOverride`, and change `pick` to:

```ts
  const pick = (start: CoachLogStart) => {
    onClose();
    if (onPickOverride) onPickOverride(start);
    else navigate(`/coach/trainee/${traineeId}/log`, { state: { start } });
  };
```

- [ ] **Step 4: Verify** (the trainee Home card must behave unchanged: defaults) and **commit**: `git commit -m "refactor(session): configurable session/plan cards and start popup"`

---

### Task 4: `CoachSessionCard` on the trainee Overview

**Files:**
- Create: `src/components/coach/CoachSessionCard.tsx`
- Modify: `src/pages/TraineeDetail.tsx`

- [ ] **Step 1: Create**

```tsx
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import type { TraineeDashboard } from '../../lib/coachData';
import type { AssignedPlan } from '../../lib/assignedPlans';
import type { WorkoutState } from '../../pages/Log';
import { currentPlan, planProgress } from '../../lib/planProgress';
import { readCoachDraft, saveCoachSession, seedSession, traineeRecentExercises, writeCoachDraft, type CoachLogDraft, type CoachLogStart } from '../../lib/coachLog';
import { TodaySessionCard } from '../home/TodaySessionCard';
import { CoachPlanCardView } from '../home/CoachPlanCardView';
import { CoachLogStartModal } from './CoachLogStart';
import { CoachSessionReview } from './CoachSessionReview';

// Trainee Overview, top: what's next for this trainee and, once started, the
// in-person session as a tick-off card. Same draft as the full coach logger.
interface Props { traineeId: string; dash: TraineeDashboard; plans: AssignedPlan[]; onSaved: () => void }

export const CoachSessionCard: React.FC<Props> = ({ traineeId, dash, plans, onSaved }) => {
  const navigate = useNavigate();
  const { overrides } = useExerciseOverrides();
  const [draft, setDraft] = useState<CoachLogDraft | null>(() => readCoachDraft(traineeId));
  const [choosing, setChoosing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const workouts = useMemo(() => (dash.workouts.shared ? dash.workouts.data : []), [dash]);
  const recent = useMemo(() => traineeRecentExercises(workouts), [workouts]);
  const plan = useMemo(() => currentPlan(plans, workouts), [plans, workouts]);

  const store = (next: CoachLogDraft | null) => { writeCoachDraft(traineeId, next); setDraft(next); };
  const begin = (start: CoachLogStart) => {
    const seed = seedSession(start, dash, plans, readCoachDraft(traineeId));
    if (seed) store({ workout: seed.workout, sourcePlanId: seed.sourcePlanId, sourcePlanDay: seed.sourcePlanDay });
  };
  const update = (workout: WorkoutState) => store({ sourcePlanId: draft?.sourcePlanId ?? null, sourcePlanDay: draft?.sourcePlanDay ?? null, workout });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveCoachSession(traineeId, draft, overrides);
      setReviewing(false);
      setDraft(null);
      toast.success(`Saved to ${dash.name}'s log`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };

  if (!dash.workouts.shared) return null;

  if (draft) {
    return (
      <>
        <TodaySessionCard
          workout={draft.workout}
          label={`Session with ${dash.name}`}
          historyUserId={traineeId}
          recentExercises={recent}
          readCurrent={() => readCoachDraft(traineeId)?.workout ?? null}
          onChange={update}
          onDiscard={() => { if (window.confirm('Discard this session? Nothing will be saved.')) store(null); }}
          onOpenLogger={() => navigate(`/coach/trainee/${traineeId}/log`, { state: { start: { kind: 'resume' } } })}
          onFinish={() => setReviewing(true)}
        />
        <CoachSessionReview open={reviewing} onClose={() => !saving && setReviewing(false)} traineeName={dash.name}
          workout={draft.workout} onTitle={(title) => update({ ...draft.workout, title })} saving={saving} onSave={save} />
      </>
    );
  }

  return (
    <>
      {plan ? (
        <div>
          <CoachPlanCardView
            plan={plan}
            coachName={null}
            eyebrow={`Next for ${dash.name}`}
            progress={planProgress(plan, workouts)}
            onStart={(day) => begin({ kind: 'plan', planId: plan.id, day })}
          />
          <button type="button" onClick={() => setChoosing(true)} className="mt-2 text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
            Repeat last session, another plan, or start blank <AppIcon name="Forward" size="sm" />
          </button>
        </div>
      ) : (
        <div className="glass-card px-4 py-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-[var(--text-primary)]">Train with {dash.name}</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Run an in-person session and tick exercises off as they go.</p>
          </div>
          <button type="button" onClick={() => setChoosing(true)} className="shrink-0 h-11 px-4 rounded-2xl font-bold text-[14px]" style={{ background: 'var(--accent)', color: '#000' }}>
            Start session
          </button>
        </div>
      )}
      <CoachLogStartModal open={choosing} onClose={() => setChoosing(false)} traineeId={traineeId} dash={dash} plans={plans} onPick={begin} />
    </>
  );
};
```

- [ ] **Step 2: Mount it on Overview.** In `src/pages/TraineeDetail.tsx`, import `CoachSessionCard` from `../components/coach/CoachSessionCard`. In the overview IIFE, replace the opening `return (\n          <DndContext` with:

```tsx
        return (
          <>
          <div className="mb-3 md:max-w-xl">
            <CoachSessionCard traineeId={id!} dash={dash} plans={plans} onSaved={() => { void loadDash(); }} />
          </div>
          <DndContext
```

Close the fragment after the matching `</DndContext>` with `</>`.

- [ ] **Step 3: Verify** and **commit**: `git commit -m "feat(coach): session card on the trainee Overview — next plan day and in-person tick-off"`

---

### Task 5: Test plan section 12

Insert before "## Known gaps" in `docs/trainer-dashboard-test-plan.md`:

```markdown
## 12. Coach session card (trainee Overview)

| ID | Steps | Expected |
|---|---|---|
| CS-1 | Coach opens a sharing trainee with an active plan | Top of Overview: "Next for <name>", day strip ticked from their logged sessions, next day's exercises, Start <day>. |
| CS-2 | Tap Start <day> | Card becomes "Session with <name>" with that day's exercises, 0 of N done, Up next. |
| CS-3 | ✓ an exercise / tap a row and change a set / + Set | Same behaviour as the trainee card (TS-2…TS-5). |
| CS-4 | + Add exercise → pick two | Added, prefilled from the **trainee's** last session; the picker's Recent tab lists the trainee's exercises. |
| CS-5 | Leave the page and come back | The session is still running with its ticks. |
| CS-6 | ⋯ → Open full logger | Full-screen coach logger shows the same session; Back returns to the card with any changes. |
| CS-7 | Finish → Save session | Toast "Saved to <name>'s log"; the card returns to "Next for <name>" with that day ticked and the next day suggested; Recent sessions shows it. |
| CS-8 | Trainee with no plan | Card reads "Train with <name>" + Start session → start popup; picking starts in the card (not the full logger). |
| CS-9 | "Repeat last session, another plan, or start blank" | Popup; Start blank → empty card with "No exercises yet"; Add exercise works. |
| CS-10 | ⋯ → Discard → confirm | Card returns to idle; nothing saved. |
| CS-11 | Trainee stops sharing Workouts | No card. |
```

Commit: `git commit -m "docs(test-plan): coach session card cases"`
