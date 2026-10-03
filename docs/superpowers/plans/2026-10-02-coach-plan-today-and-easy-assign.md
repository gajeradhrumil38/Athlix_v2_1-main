# Coach Plan "Today" Card and Easy Assign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coached trainee sees "what to do today" from their coach's plan on Home, and a coach can assign a sensible plan in about 2 taps with no typing.

**Architecture:**
- Each workout records which plan day it was: a new `workouts.source_plan_day` column, written through the existing `save_workout_with_sets` RPC.
- A pure module, `planProgress.ts`, turns a plan plus the trainee's plan sessions into per-day progress, the next day (rotation) and the current plan.
- `CoachPlanCardView` renders that progress. It's shared by the trainee's Home card and the coach's "Preview & send" step.
- The Assign sheet gains:
  - a starting-point step, built from the pure `planStarters.ts` and `config/planSplits.ts`
  - compact exercise rows with "whole day" set/rep chips
  - a preview step

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, Supabase (Postgres RPC + RLS), date-fns, framer-motion. Vitest is new, for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-02-coach-plan-today-and-easy-assign-design.md`

**Conventions to follow** (from `CLAUDE.md`):
- Icons only via `<AppIcon name=… />` from `src/config/icons.tsx`. No direct Lucide imports in new files.
- Colors via CSS vars (`var(--accent)` and so on).
- Weights are lb everywhere. Comments only when the *why* is non-obvious.
- `src/` is excluded from the root `tsconfig.json`. Type-check it with the temporary config described in Task 13.

## File map

| File | Status | Responsibility |
|---|---|---|
| `package.json` | modify | add `vitest`, `"test": "vitest run"` |
| `src/lib/planProgress.ts` | create | pure: `dayOfSession`, `planProgress`, `currentPlan` |
| `src/lib/planProgress.test.ts` | create | unit tests |
| `supabase/migrations/20261002010000_workout_source_plan_day.sql` | create | column + RPC param + plan-link validation |
| `supabase/tests/plan_day_check.sql` | create | rolled-back DB check for the migration |
| `src/lib/supabaseData.ts` | modify | `saveWorkout` accepts `source_plan_day` |
| `src/pages/Log.tsx` | modify | carry `sourcePlanDay` from route state to save |
| `src/lib/assignedPlans.ts` | modify | `planStartState()`, `getMyPlanSessions()` |
| `src/components/home/CoachPlanCardView.tsx` | create | presentational card (also used as preview) |
| `src/components/home/CoachPlanCard.tsx` | create | trainee Home container: fetch, switch, start |
| `src/pages/Home.tsx` | modify | render `<CoachPlanCard />` first |
| `src/pages/MyCoach.tsx`, `src/components/coach/AssignedPlanModal.tsx`, `src/components/coach/PlanPreviewModal.tsx` | modify | start via `planStartState()` (passes the day) |
| `src/pages/CoachLogSession.tsx` | modify | record the plan day on coach-logged sessions |
| `src/lib/coachData.ts`, `src/pages/TraineeDetail.tsx` | modify | coach adherence uses `dayOfSession` |
| `src/config/planSplits.ts` | create | starter split data |
| `src/lib/planStarters.ts` | create | pure: build a starter plan from split / recent training / template |
| `src/lib/planStarters.test.ts` | create | unit tests |
| `src/components/coach/assign/PlanExerciseRow.tsx` | create | compact, expandable exercise row (+ PrescribeTile) |
| `src/components/coach/assign/AssignStartStep.tsx` | create | starting-point cards |
| `src/components/coach/assign/AssignPreviewStep.tsx` | create | preview + message + send |
| `src/components/coach/AssignPlanSheet.tsx` | rewrite | orchestrates start → build → preview |
| `docs/trainer-dashboard-test-plan.md` | modify | add section 10 |

---

### Task 0: Commit the pending coach-logger work

The previous change (coach "Log session" in the real logger) is built but uncommitted. Later tasks edit the same files.

- [ ] **Step 1: Commit**

```bash
git add src/pages/CoachLogSession.tsx src/components/log/ActiveWorkout.tsx src/pages/TraineeDetail.tsx src/App.tsx src/components/layout/Layout.tsx
git add -u src/components/coach/LogForTraineeSheet.tsx
git commit -m "feat(coach): log a trainee session in the same logger the athlete uses

Coach 'Log' opens /coach/trainee/:id/log: start from the trainee's last
session, an assigned plan day, or blank; ActiveWorkout prefills from the
trainee's history and shows their recent exercises; review & save writes
to the trainee's log. Replaces LogForTraineeSheet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Add Vitest

**Files:** Modify `package.json`.

- [ ] **Step 1: Install**

```bash
npm i -D vitest@^3
```

- [ ] **Step 2: Set the test script.** In `package.json`, replace `"test": "echo \"No tests configured\""` with:

```json
"test": "vitest run",
```

- [ ] **Step 3: Verify it runs**

Run `npx vitest run`. Expected: "No test files found", exit code 1. That's fine at this point.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

### Task 2: `planProgress.ts` (TDD)

**Files:**
- Create: `src/lib/planProgress.ts`
- Test: `src/lib/planProgress.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/planProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AssignedPlan } from './assignedPlans';
import { currentPlan, dayOfSession, planProgress, type PlanSession } from './planProgress';

const NOW = new Date('2026-10-02T12:00:00').getTime();

const ex = (name: string, day: string | null) => ({
  name, default_sets: 3, default_reps: 10, default_weight: 0, unit: 'lbs', order_index: 0, day_label: day,
});

const ppl: AssignedPlan = {
  id: 'p1', trainer_id: 't', trainee_id: 'u', title: 'PPL', notes: null, status: 'active',
  created_at: '2026-09-01T00:00:00Z',
  exercises: [
    ex('Bench Press', 'Push'), ex('Lateral Raises', 'Push'),
    ex('Lat Pulldown', 'Pull'), ex('Hammer Curl', 'Pull'),
    ex('Barbell Back Squat', 'Legs'), ex('Bench Press', 'Legs'),
  ],
};

const single: AssignedPlan = { ...ppl, id: 'p2', title: 'Full', created_at: '2026-09-20T00:00:00Z', exercises: [ex('Squat', null)] };

const s = (over: Partial<PlanSession>): PlanSession => ({
  id: Math.random().toString(36), date: '2026-10-01', created_at: null, source_plan_id: 'p1',
  source_plan_day: null, exercises: [], ...over,
});

describe('dayOfSession', () => {
  it('uses the stored day when it matches a plan day', () => {
    expect(dayOfSession(ppl, s({ source_plan_day: 'pull' }))).toBe('Pull');
  });
  it('infers from exercises when no day is stored', () => {
    expect(dayOfSession(ppl, s({ exercises: [{ name: 'Lat Pulldown' }, { name: 'Hammer Curl' }] }))).toBe('Pull');
  });
  it('falls back to inference when the stored day was renamed away', () => {
    expect(dayOfSession(ppl, s({ source_plan_day: 'Old name', exercises: [{ name: 'Barbell Back Squat' }] }))).toBe('Legs');
  });
  it('breaks inference ties toward the earlier day', () => {
    expect(dayOfSession(ppl, s({ exercises: [{ name: 'Bench Press' }] }))).toBe('Push');
  });
  it('returns the empty label for a single-day plan', () => {
    expect(dayOfSession(single, s({ source_plan_id: 'p2' }))).toBe('');
  });
});

describe('planProgress', () => {
  it('suggests the first day when nothing is done', () => {
    const p = planProgress(ppl, [], NOW);
    expect(p.nextDay).toBe('Push');
    expect(p.doneToday).toBe(false);
    expect(p.days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs']);
  });
  it('rotates to the day after the latest session', () => {
    const p = planProgress(ppl, [s({ date: '2026-09-30', source_plan_day: 'Push' }), s({ date: '2026-10-01', source_plan_day: 'Pull' })], NOW);
    expect(p.nextDay).toBe('Legs');
    expect(p.days.find((d) => d.label === 'Push')?.doneRecently).toBe(true);
    expect(p.days.find((d) => d.label === 'Legs')?.doneRecently).toBe(false);
  });
  it('wraps from the last day back to the first', () => {
    expect(planProgress(ppl, [s({ source_plan_day: 'Legs' })], NOW).nextDay).toBe('Push');
  });
  it('orders same-date sessions by created_at', () => {
    const p = planProgress(ppl, [
      s({ date: '2026-10-01', created_at: '2026-10-01T18:00:00Z', source_plan_day: 'Pull' }),
      s({ date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', source_plan_day: 'Push' }),
    ], NOW);
    expect(p.nextDay).toBe('Legs');
  });
  it('reports a session done today', () => {
    const p = planProgress(ppl, [s({ date: '2026-10-02', source_plan_day: 'Push' })], NOW);
    expect(p.doneToday).toBe(true);
    expect(p.doneTodayDay).toBe('Push');
  });
  it('does not count sessions older than 7 days as recent', () => {
    const p = planProgress(ppl, [s({ date: '2026-09-20', source_plan_day: 'Push' })], NOW);
    expect(p.days[0].doneRecently).toBe(false);
    expect(p.days[0].lastDone).toBe('2026-09-20');
    expect(p.sessionsThisWeek).toBe(0);
  });
  it('ignores sessions from another plan', () => {
    expect(planProgress(ppl, [s({ source_plan_id: 'other', source_plan_day: 'Push' })], NOW).nextDay).toBe('Push');
  });
  it('counts single-day sessions this week', () => {
    const p = planProgress(single, [s({ source_plan_id: 'p2', date: '2026-10-01' }), s({ source_plan_id: 'p2', date: '2026-09-29' })], NOW);
    expect(p.sessionsThisWeek).toBe(2);
    expect(p.nextDay).toBe('');
  });
});

describe('currentPlan', () => {
  it('picks the plan trained from most recently', () => {
    expect(currentPlan([ppl, single], [s({ source_plan_id: 'p1', date: '2026-10-01' })])?.id).toBe('p1');
  });
  it('falls back to the newest assigned plan', () => {
    expect(currentPlan([ppl, single], [])?.id).toBe('p2');
  });
  it('returns null with no plans', () => {
    expect(currentPlan([], [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run `npx vitest run src/lib/planProgress.test.ts`. Expected: FAIL, "Failed to resolve import ./planProgress".

- [ ] **Step 3: Implement**

`src/lib/planProgress.ts`:

```ts
import { groupByDay, type AssignedPlan } from './assignedPlans';

// Pure plan-progress logic: which day a session was, how far a trainee is
// through a plan, and which day comes next (rotation). No React, no Supabase.

export interface PlanSession {
  id: string;
  date: string; // yyyy-MM-dd (local)
  created_at?: string | null;
  source_plan_id: string | null;
  source_plan_day?: string | null;
  exercises?: { name: string }[] | null;
}

export interface DayProgress { label: string; doneRecently: boolean; lastDone: string | null; }

export interface PlanProgress {
  days: DayProgress[];
  nextDay: string;
  doneToday: boolean;
  doneTodayDay: string | null;
  sessionsThisWeek: number;
}

const DAY_MS = 86_400_000;
const norm = (v: string) => v.trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const withinWeek = (date: string, now: number) => now - new Date(`${date}T00:00:00`).getTime() < 7 * DAY_MS;

const newestFirst = (a: PlanSession, b: PlanSession) =>
  b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

export function dayOfSession(plan: AssignedPlan, session: PlanSession): string | null {
  const groups = groupByDay(plan.exercises);
  if (!groups.length) return null;
  if (session.source_plan_day != null) {
    const hit = groups.find(([label]) => norm(label) === norm(session.source_plan_day!));
    if (hit) return hit[0];
  }
  // No usable stored day (logged before it was recorded, or the day was
  // renamed): pick the day whose exercises overlap most; ties → earlier day.
  const names = new Set((session.exercises ?? []).map((e) => norm(e.name)));
  let best = groups[0][0];
  let bestHits = -1;
  for (const [label, exs] of groups) {
    const hits = exs.filter((e) => names.has(norm(e.name))).length;
    if (hits > bestHits) { best = label; bestHits = hits; }
  }
  return best;
}

export function planProgress(plan: AssignedPlan, sessions: PlanSession[], now: number = Date.now()): PlanProgress {
  const labels = groupByDay(plan.exercises).map(([label]) => label);
  const mine = sessions.filter((s) => s.source_plan_id === plan.id).sort(newestFirst);
  const tagged = mine.map((s) => ({ s, day: dayOfSession(plan, s) }));
  const today = localDate(now);

  const days = labels.map((label) => {
    const last = tagged.find((t) => t.day === label);
    return { label, lastDone: last?.s.date ?? null, doneRecently: !!last && withinWeek(last.s.date, now) };
  });

  const latestDay = tagged[0]?.day;
  const idx = latestDay != null ? labels.indexOf(latestDay) : -1;
  const nextDay = labels.length ? labels[idx === -1 ? 0 : (idx + 1) % labels.length] : '';
  const todays = tagged.find((t) => t.s.date === today);

  return {
    days,
    nextDay,
    doneToday: !!todays,
    doneTodayDay: todays?.day ?? null,
    sessionsThisWeek: mine.filter((s) => withinWeek(s.date, now)).length,
  };
}

export function currentPlan(plans: AssignedPlan[], sessions: PlanSession[]): AssignedPlan | null {
  if (!plans.length) return null;
  const latest = [...sessions].filter((s) => plans.some((p) => p.id === s.source_plan_id)).sort(newestFirst)[0];
  if (latest) return plans.find((p) => p.id === latest.source_plan_id) ?? null;
  return [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
```

- [ ] **Step 4: Run tests**

Run `npx vitest run src/lib/planProgress.test.ts`. Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planProgress.ts src/lib/planProgress.test.ts
git commit -m "feat(plans): pure plan-progress logic (day of session, rotation, current plan)"
```

---

### Task 3: Migration — `source_plan_day` + plan-link validation

**Files:**
- Create: `supabase/migrations/20261002010000_workout_source_plan_day.sql`
- Create: `supabase/tests/plan_day_check.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20261002010000_workout_source_plan_day.sql`:

```sql
-- Record WHICH day of an assigned plan a workout was, so the trainee's Home
-- card can suggest the next day (rotation) and the coach's adherence card can
-- score the right day. Nullable: NULL = unknown/not from a plan; '' = a
-- single-day plan. Also closes the "unchecked plan link" gap: a plan id that
-- isn't assigned to the workout's owner is dropped instead of stored.
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS source_plan_day text;

DROP FUNCTION IF EXISTS public.save_workout_with_sets(text, date, integer, text, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.save_workout_with_sets(
  p_title text,
  p_workout_date date,
  p_duration_minutes integer,
  p_notes text,
  p_exercises jsonb,
  p_source_plan_id uuid DEFAULT NULL,
  p_trainee_id uuid DEFAULT NULL,
  p_source_plan_day text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_workout_id UUID;
  v_muscle_groups TEXT[];
  v_exercise JSONB;
  v_set JSONB;
  v_order_index INTEGER := 0;
  v_exercise_name TEXT;
  v_exercise_muscle_group TEXT;
  v_exercise_db_id TEXT;
  v_reps INTEGER;
  v_weight DOUBLE PRECISION;
  v_unit TEXT;
  v_title TEXT;
  v_distinct_exercise_names INTEGER;
  v_only_exercise_name TEXT;
  v_plan_id UUID := p_source_plan_id;
  v_plan_day TEXT := p_source_plan_day;
BEGIN
  IF p_trainee_id IS NOT NULL THEN
    IF NOT public.coach_can_see(p_trainee_id, 'workouts') THEN
      RAISE EXCEPTION 'Not authorized to log for this trainee';
    END IF;
    v_user_id := p_trainee_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assigned_plans p WHERE p.id = v_plan_id AND p.trainee_id = v_user_id
  ) THEN
    v_plan_id := NULL;
  END IF;
  IF v_plan_id IS NULL THEN
    v_plan_day := NULL;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Workout title is required';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' OR jsonb_array_length(p_exercises) = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  v_title := btrim(p_title);

  SELECT count(DISTINCT NULLIF(btrim(item->>'name'), ''))
  INTO v_distinct_exercise_names
  FROM jsonb_array_elements(p_exercises) AS item;

  IF v_distinct_exercise_names = 1 THEN
    SELECT NULLIF(btrim(item->>'name'), '')
    INTO v_only_exercise_name
    FROM jsonb_array_elements(p_exercises) AS item
    LIMIT 1;

    IF v_only_exercise_name IS NOT NULL AND lower(v_title) = lower(v_only_exercise_name) THEN
      v_title := 'Workout';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT muscle_group), ARRAY[]::TEXT[])
  INTO v_muscle_groups
  FROM (
    SELECT NULLIF(btrim(item->>'muscle_group'), '') AS muscle_group
    FROM jsonb_array_elements(p_exercises) AS item
  ) grouped
  WHERE muscle_group IS NOT NULL;

  INSERT INTO public.workouts (
    user_id, title, date, duration_minutes, notes, muscle_groups, source_plan_id, source_plan_day
  )
  VALUES (
    v_user_id, v_title, p_workout_date, GREATEST(COALESCE(p_duration_minutes, 0), 0),
    NULLIF(btrim(COALESCE(p_notes, '')), ''), v_muscle_groups, v_plan_id, v_plan_day
  )
  RETURNING id INTO v_workout_id;

  FOR v_exercise IN
    SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    v_exercise_name := NULLIF(btrim(v_exercise->>'name'), '');
    v_exercise_muscle_group := NULLIF(btrim(v_exercise->>'muscle_group'), '');
    v_exercise_db_id := NULLIF(v_exercise->>'exercise_db_id', '');

    IF v_exercise_name IS NULL THEN
      RAISE EXCEPTION 'Exercise name is required';
    END IF;

    FOR v_set IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_exercise->'completed_sets', '[]'::jsonb))
    LOOP
      v_reps := GREATEST(COALESCE((v_set->>'reps')::INTEGER, 0), 0);
      v_weight := GREATEST(COALESCE((v_set->>'weight')::DOUBLE PRECISION, 0), 0);
      v_unit := lower(COALESCE(NULLIF(v_set->>'unit', ''), 'kg'));

      IF v_unit NOT IN ('kg', 'lbs', 'km', 'mi') THEN
        v_unit := 'kg';
      END IF;

      IF v_reps <= 0 AND v_weight <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.exercises (
        workout_id, name, muscle_group, sets, reps, weight, unit, order_index, exercise_db_id
      )
      VALUES (
        v_workout_id, v_exercise_name, v_exercise_muscle_group, 1, v_reps, v_weight, v_unit, v_order_index, v_exercise_db_id
      );

      IF v_unit IN ('kg', 'lbs') THEN
        INSERT INTO public.personal_records (
          user_id, exercise_name, best_weight, best_reps, achieved_date, exercise_db_id, unit
        )
        VALUES (
          v_user_id, v_exercise_name, v_weight, v_reps, p_workout_date, v_exercise_db_id, v_unit
        )
        ON CONFLICT (user_id, exercise_name) DO UPDATE
        SET best_weight = EXCLUDED.best_weight,
            best_reps = EXCLUDED.best_reps,
            achieved_date = EXCLUDED.achieved_date,
            exercise_db_id = COALESCE(EXCLUDED.exercise_db_id, public.personal_records.exercise_db_id),
            unit = EXCLUDED.unit
        WHERE EXCLUDED.best_weight > public.personal_records.best_weight
           OR (
             EXCLUDED.best_weight = public.personal_records.best_weight
             AND EXCLUDED.best_reps > public.personal_records.best_reps
           );
      END IF;

      v_order_index := v_order_index + 1;
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$function$;
```

- [ ] **Step 2: Write the rolled-back check**

`supabase/tests/plan_day_check.sql`:

```sql
-- Checks migration 20261002010000 in the Supabase SQL Editor. Acts as the
-- trainee of the first accepted coach link, then ABORTS on purpose: results
-- arrive as the error message and nothing is saved. "BAD" = failure.
CREATE TEMP TABLE _r (n serial, test text, outcome text);
GRANT ALL ON _r TO authenticated;
GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
DO $$
DECLARE l record; plan_id uuid; w uuid; foreign_plan uuid := gen_random_uuid();
BEGIN
  SELECT * INTO l FROM public.coach_links WHERE status = 'accepted' LIMIT 1;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Needs one accepted coach link'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', l.trainer_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.assigned_plans (trainer_id, trainee_id, title) VALUES (l.trainer_id, l.trainee_id, 'zz plan') RETURNING id INTO plan_id;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', l.trainee_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb, plan_id, null, 'Push');
  INSERT INTO _r(test, outcome) SELECT 'valid plan + day stored (want plan/Push)',
    format('%s/%s', CASE WHEN source_plan_id = plan_id THEN 'plan' ELSE 'BAD' END, coalesce(source_plan_day, 'NULL')) FROM public.workouts WHERE id = w;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb, foreign_plan, null, 'Push');
  INSERT INTO _r(test, outcome) SELECT 'foreign plan dropped (want NULL/NULL)',
    format('%s/%s', coalesce(source_plan_id::text, 'NULL'), coalesce(source_plan_day, 'NULL')) FROM public.workouts WHERE id = w;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb);
  INSERT INTO _r(test, outcome) SELECT 'old 5-arg call still works (want NULL)', coalesce(source_plan_day, 'NULL') FROM public.workouts WHERE id = w;
  RESET ROLE;
END $$;
DO $$ BEGIN
  RAISE EXCEPTION E'TEST RESULTS (aborted on purpose, nothing saved):\n%', (SELECT string_agg(n || '. ' || test || ' => ' || outcome, E'\n' ORDER BY n) FROM _r);
END $$;
```

- [ ] **Step 3: The user applies the migration and runs the check.** Hand both files to the user. They paste the migration into the Supabase SQL Editor (project AthlixV2) and run it, then do the same with the check. All 3 lines must pass. This must happen **before** deploying Task 4 or later, because the client starts sending `p_source_plan_day`.

- [ ] **Step 4: Verify from here (read-only)**

Using the Supabase MCP `execute_sql` (read-only):

```sql
select column_name from information_schema.columns where table_name='workouts' and column_name='source_plan_day';
select pg_get_function_identity_arguments(p.oid) from pg_proc p where proname='save_workout_with_sets';
```

Expected: one row `source_plan_day`, and exactly one signature ending in `p_source_plan_day text`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002010000_workout_source_plan_day.sql supabase/tests/plan_day_check.sql
git commit -m "feat(db): record the plan day on workouts; drop plan links that aren't the owner's"
```

---

### Task 4: Carry the plan day through the save

**Files:**
- Modify: `src/lib/supabaseData.ts` (`saveWorkout`, around lines 1651–1710)
- Modify: `src/pages/Log.tsx` (lines ~219, ~283, ~526)

- [ ] **Step 1: `saveWorkout` input type.** In `src/lib/supabaseData.ts`, inside the `saveWorkout` input type, after `source_plan_id?: string | null;`, add:

```ts
    // Which day of that plan ('' = single-day plan) — drives the trainee's
    // next-day rotation and the coach's per-day adherence.
    source_plan_day?: string | null;
```

- [ ] **Step 2: Pass it to the RPC.** In the `rpcPayload` object, after `p_trainee_id: input.trainee_id || null,`, add:

```ts
    p_source_plan_day: input.source_plan_id ? (input.source_plan_day ?? null) : null,
```

- [ ] **Step 3: Log.tsx ref.** In `src/pages/Log.tsx`, after `const sourcePlanIdRef = useRef<string | null>(null);`, add:

```ts
  const sourcePlanDayRef = useRef<string | null>(null);
```

- [ ] **Step 4: Read it from route state.** Replace

```ts
      sourcePlanIdRef.current = (location.state as { sourcePlanId?: string } | null)?.sourcePlanId ?? null;
```

with

```ts
      const planState = location.state as { sourcePlanId?: string; sourcePlanDay?: string } | null;
      sourcePlanIdRef.current = planState?.sourcePlanId ?? null;
      sourcePlanDayRef.current = planState?.sourcePlanDay ?? null;
```

- [ ] **Step 5: Send it on save.** In `handleSave`, after `source_plan_id: sourcePlanIdRef.current,`, add:

```ts
        source_plan_day: sourcePlanDayRef.current,
```

- [ ] **Step 6: Type-check** (Task 13, step 1). Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabaseData.ts src/pages/Log.tsx
git commit -m "feat(plans): logger records which plan day a session came from"
```

---

### Task 5: `planStartState` + `getMyPlanSessions`

**Files:** Modify `src/lib/assignedPlans.ts`.

- [ ] **Step 1: Imports.** At the top of `src/lib/assignedPlans.ts`, below `import { supabase } from './supabase';`, add:

```ts
import { format, subDays } from 'date-fns';
import type { PlanSession } from './planProgress';
```

- [ ] **Step 2: Append the helpers** at the end of the file:

```ts
// Route state for starting one day of a plan in the logger. Every "start
// from a plan" entry point uses this, so they all record the same day.
export function planStartState(plan: AssignedPlan, dayLabel: string) {
  const groups = groupByDay(plan.exercises);
  const isMulti = groups.length > 1;
  const exercises = groups.find(([label]) => label === dayLabel)?.[1] ?? plan.exercises;
  return {
    recommendedExercises: exercises.map((e) => ({
      name: e.name,
      sets: e.default_sets,
      reps: String(e.default_reps),
      rest: e.rest_seconds ?? null,
      weight: e.default_weight || null,
    })),
    suggestedTitle: isMulti && dayLabel ? `${plan.title} — ${dayLabel}` : plan.title,
    sourcePlanId: plan.id,
    sourcePlanDay: isMulti ? dayLabel : '',
  };
}

// Trainee: my recent sessions performed from any of these plans (60 days).
export async function getMyPlanSessions(planIds: string[]): Promise<PlanSession[]> {
  const me = await meId();
  if (!me || !planIds.length) return [];
  const { data } = await supabase
    .from('workouts')
    .select('id, date, created_at, source_plan_id, source_plan_day, exercises(name)')
    .eq('user_id', me)
    .in('source_plan_id', planIds)
    .gte('date', format(subDays(new Date(), 60), 'yyyy-MM-dd'))
    .order('date', { ascending: false })
    .limit(200);
  return (data ?? []) as PlanSession[];
}
```

- [ ] **Step 3: Type-check** (Task 13, step 1), then run `npx vitest run`. Expected: no new type errors; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/assignedPlans.ts
git commit -m "feat(plans): shared plan start state and trainee plan-session query"
```

---

### Task 6: `CoachPlanCardView` (presentational)

**Files:** Create `src/components/home/CoachPlanCardView.tsx`.

- [ ] **Step 1: Create the component**

```tsx
import React, { useState } from 'react';
import { AppIcon } from '../../config/icons';
import { groupByDay, type AssignedPlan } from '../../lib/assignedPlans';
import type { PlanProgress } from '../../lib/planProgress';

// The trainee's "From your coach" card. Purely presentational so the coach's
// Assign "Preview & send" step can render exactly what the trainee will see.
interface Props {
  plan: AssignedPlan;
  coachName: string | null;
  progress: PlanProgress;
  preview?: boolean;
  otherPlansCount?: number;
  onStart?: (dayLabel: string) => void;
  onOpenPlan?: () => void;
  onSwitch?: () => void;
}

const dayName = (label: string, i: number) => label || `Day ${i + 1}`;

export const CoachPlanCardView: React.FC<Props> = ({ plan, coachName, progress, preview, otherPlansCount = 0, onStart, onOpenPlan, onSwitch }) => {
  const [pickingDay, setPickingDay] = useState(false);
  const groups = groupByDay(plan.exercises);
  const isMulti = groups.length > 1;
  const nextIdx = Math.max(0, groups.findIndex(([label]) => label === progress.nextDay));
  const [nextLabel, nextExercises] = groups[nextIdx] ?? ['', plan.exercises];
  const shown = nextExercises.slice(0, 4);
  const doneTodayIdx = progress.doneTodayDay != null ? groups.findIndex(([l]) => l === progress.doneTodayDay) : -1;

  return (
    <div className="glass-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenPlan} disabled={preview} className="min-w-0 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            From {coachName || 'your coach'}
          </p>
          <p className="text-[18px] font-bold text-[var(--text-primary)] leading-tight truncate mt-0.5">{plan.title}</p>
        </button>
        {otherPlansCount > 0 && !preview && (
          <button type="button" onClick={onSwitch} className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">
            Switch
          </button>
        )}
      </div>

      {plan.notes && <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-snug">{plan.notes}</p>}

      {isMulti && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
          {groups.map(([label], i) => {
            const day = progress.days[i];
            const isNext = i === nextIdx;
            return (
              <span key={i} className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold flex items-center gap-1"
                style={isNext
                  ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }
                  : { background: 'var(--bg-elevated)', color: day?.doneRecently ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid transparent' }}>
                {day?.doneRecently && <AppIcon name="Check" size="sm" />}
                {dayName(label, i)}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        {progress.doneToday ? (
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            {isMulti && doneTodayIdx >= 0 ? `${dayName(groups[doneTodayIdx][0], doneTodayIdx)} done today ✓` : 'Done today ✓'}
            {isMulti && <span className="text-[var(--text-muted)] font-medium"> · Next: {dayName(nextLabel, nextIdx)}</span>}
          </p>
        ) : (
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            {isMulti ? `Today: ${dayName(nextLabel, nextIdx)}` : 'Today'}
            {!isMulti && progress.sessionsThisWeek > 0 && (
              <span className="text-[var(--text-muted)] font-medium"> · Done {progress.sessionsThisWeek}× this week</span>
            )}
          </p>
        )}
        <div className="mt-2 space-y-1.5">
          {shown.map((e, i) => (
            <div key={i}>
              <p className="text-[13px] text-[var(--text-secondary)] flex justify-between gap-2">
                <span className="truncate text-[var(--text-primary)]">{e.name}</span>
                <span className="shrink-0 tabular-nums">{e.default_sets} × {e.default_reps}{e.default_weight ? ` @ ${e.default_weight} lb` : ''}</span>
              </p>
              {e.note && <p className="text-[12px] leading-snug" style={{ color: 'var(--accent)' }}>{e.note}</p>}
            </div>
          ))}
          {nextExercises.length > shown.length && (
            <p className="text-[12px] text-[var(--text-muted)]">+{nextExercises.length - shown.length} more</p>
          )}
        </div>
      </div>

      {!preview && (
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => onStart?.(nextLabel)}
            className="flex-1 h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-1.5"
            style={progress.doneToday
              ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
              : { background: 'var(--accent)', color: '#000' }}>
            <AppIcon name="Plus" size="sm" />
            {progress.doneToday ? 'Train again' : `Start ${isMulti ? dayName(nextLabel, nextIdx) : 'workout'}`}
          </button>
          {isMulti && (
            <button type="button" onClick={() => setPickingDay(true)}
              className="h-12 px-4 rounded-2xl font-semibold text-[14px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}>
              Other day
            </button>
          )}
        </div>
      )}

      {pickingDay && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(3,5,9,0.9)' }} onClick={() => setPickingDay(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" onClick={(ev) => ev.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <p className="text-[18px] font-bold text-[var(--text-primary)] mb-3">Pick a day</p>
            <div className="space-y-2">
              {groups.map(([label, exs], i) => (
                <button key={i} type="button" onClick={() => { setPickingDay(false); onStart?.(label); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left" style={{ background: 'var(--bg-elevated)' }}>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)]">{dayName(label, i)}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {progress.days[i]?.doneRecently ? 'Done this week ✓ · ' : ''}{exs.length} exercises
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check** (Task 13, step 1). Expected: no new errors. If `Check` isn't in the ICONS registry, check with `grep -n "Check:" src/config/icons.tsx`. It's already used by `InviteTraineeSheet`, so it should exist.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/CoachPlanCardView.tsx
git commit -m "feat(home): coach plan card view (shared with the coach preview)"
```

---

### Task 7: `CoachPlanCard` container on Home

**Files:**
- Create: `src/components/home/CoachPlanCard.tsx`
- Modify: `src/pages/Home.tsx` (imports ~line 21, render ~line 931)

- [ ] **Step 1: Create the container**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyAssignedPlans, getMyPlanSessions, planStartState, type AssignedPlan } from '../../lib/assignedPlans';
import { getMyCoaches, type CoachLink } from '../../lib/coachLinks';
import { currentPlan, planProgress, type PlanSession } from '../../lib/planProgress';
import { CoachPlanCardView } from './CoachPlanCardView';

// Trainee Home: "what to do today" from the coach's current plan. Hidden for
// anyone without an active plan.
export const CoachPlanCard: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [coaches, setCoaches] = useState<CoachLink[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, c] = await Promise.all([getMyAssignedPlans(), getMyCoaches()]);
      const s = await getMyPlanSessions(p.map((x) => x.id));
      if (!cancelled) { setPlans(p); setCoaches(c); setSessions(s); }
    })();
    return () => { cancelled = true; };
  }, []);

  const plan = useMemo(
    () => plans.find((p) => p.id === pickedId) ?? currentPlan(plans, sessions),
    [plans, sessions, pickedId],
  );
  if (!plan) return null;

  const coachName = coaches.find((c) => c.trainer_id === plan.trainer_id)?.trainer_name ?? null;
  const others = plans.filter((p) => p.id !== plan.id);

  return (
    <>
      <CoachPlanCardView
        plan={plan}
        coachName={coachName}
        progress={planProgress(plan, sessions)}
        otherPlansCount={others.length}
        onStart={(day) => navigate('/log', { state: planStartState(plan, day) })}
        onOpenPlan={() => navigate('/my-coach')}
        onSwitch={() => setSwitching(true)}
      />
      {switching && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(3,5,9,0.9)' }} onClick={() => setSwitching(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <p className="text-[18px] font-bold text-[var(--text-primary)] mb-3">Your plans</p>
            <div className="space-y-2">
              {plans.map((p) => (
                <button key={p.id} type="button" onClick={() => { setPickedId(p.id); setSwitching(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left"
                  style={{ background: 'var(--bg-elevated)', border: p.id === plan.id ? '1px solid var(--accent)' : '1px solid transparent' }}>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{p.title}</span>
                  <span className="text-[12px] text-[var(--text-muted)] shrink-0">{p.exercises.length} exercises</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
```

- [ ] **Step 2: Mount it on Home.** In `src/pages/Home.tsx`, below `import { NotificationsCard } from '../components/home/NotificationsCard';`, add:

```ts
import { CoachPlanCard } from '../components/home/CoachPlanCard';
```

Then replace:

```tsx
        <UpcomingAppointmentBanner />
```

with:

```tsx
        <CoachPlanCard />
        <UpcomingAppointmentBanner />
```

- [ ] **Step 3: Type-check and build** (Task 13, steps 1 and 3). Expected: no new errors; the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/CoachPlanCard.tsx src/pages/Home.tsx
git commit -m "feat(home): 'From your coach' card with today's plan day and rotation"
```

---

### Task 8: Every plan start records the day

**Files:**
- Modify: `src/pages/MyCoach.tsx`
- Modify: `src/components/coach/AssignedPlanModal.tsx`
- Modify: `src/components/coach/PlanPreviewModal.tsx`
- Modify: `src/pages/CoachLogSession.tsx`

- [ ] **Step 1: MyCoach.** In `src/pages/MyCoach.tsx`, change the import to:

```ts
import { getMyAssignedPlans, groupByDay, planStartState, type AssignedPlan } from '../lib/assignedPlans';
```

Replace the whole `start` function with:

```ts
  const start = (plan: AssignedPlan, dayLabel: string) => {
    navigate('/log', { state: planStartState(plan, dayLabel) });
  };
```

Replace the button's `onClick`:

```tsx
                        onClick={() => start(p, exercises, isMultiDay ? (dayLabel || `Day ${gi + 1}`) : undefined)}
```

with:

```tsx
                        onClick={() => start(p, dayLabel)}
```

Remove the now-unused `AssignedPlanExercise` import if lint flags it.

- [ ] **Step 2: AssignedPlanModal.** In `src/components/coach/AssignedPlanModal.tsx`, change the import to:

```ts
import { getMyAssignedPlans, groupByDay, planStartState, type AssignedPlan } from '../../lib/assignedPlans';
```

Replace the body of `start` from `const recommendedExercises = …` through the `navigate('/log', …)` line with:

```ts
    navigate('/log', { state: planStartState(current, dayGroups[0]?.[0] ?? '') });
```

The `if (isMultiDay) { navigate('/my-coach'); return; }` line above it stays.

- [ ] **Step 3: PlanPreviewModal.** In `src/components/coach/PlanPreviewModal.tsx`, change the import to:

```ts
import { groupByDay, planStartState, type AssignedPlan } from '../../lib/assignedPlans';
```

Replace the `recommendedExercises` block and its `navigate` in `start` with:

```ts
    navigate('/log', { state: planStartState(plan, dayGroups[0]?.[0] ?? '') });
```

- [ ] **Step 4: CoachLogSession records the day.** In `src/pages/CoachLogSession.tsx`:

  - Change the draft type to `type Draft = { workout: WorkoutState; sourcePlanId: string | null; sourcePlanDay?: string | null };`.
  - Add a state below `sourcePlanId`: `const [sourcePlanDay, setSourcePlanDay] = useState<string | null>(null);`.
  - In the draft-writing effect, write `{ workout, sourcePlanId, sourcePlanDay }` and add `sourcePlanDay` to the effect's dependencies.
  - Change `start` to:

```ts
  const start = (exercises: ExerciseEntry[], title = '', planId: string | null = null, pickFirst = false, planDay: string | null = null) => {
    setSourcePlanId(planId);
    setSourcePlanDay(planId ? planDay : null);
    setWorkout(newWorkout(exercises, title));
    setOpenPicker(pickFirst);
  };
```

  - In `saveWorkout(id, { … })`, after `source_plan_id: sourcePlanId,`, add `source_plan_day: sourcePlanDay,`.
  - In the "Resume unsaved session" card `onClick`, also call `setSourcePlanDay(draft.sourcePlanDay ?? null);`.
  - In the "Repeat last session" card, pass `last.source_plan_day ?? null` as the 5th argument to `start`. Then add `source_plan_day?: string | null;` to `TraineeWorkout` in `src/lib/coachData.ts` (Task 9 also selects the column).
  - In `planDays`, keep the raw label: add `day: label,` to each mapped object. Then in its card, call `start(entriesFromPlan(d.exs), d.label, d.plan.id, false, all.length > 1 ? d.day : '')`. To make `all.length` available there, store `isMulti: all.length > 1` on each item and use `d.isMulti ? d.day : ''`.

- [ ] **Step 5: Type-check and test** (Task 13, steps 1–2). Expected: no new errors; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/MyCoach.tsx src/components/coach/AssignedPlanModal.tsx src/components/coach/PlanPreviewModal.tsx src/pages/CoachLogSession.tsx src/lib/coachData.ts
git commit -m "feat(plans): every plan start (card, My Coach, popup, preview, coach log) records the day"
```

---

### Task 9: Coach adherence uses `dayOfSession`

**Files:**
- Modify: `src/lib/coachData.ts` (workouts select)
- Modify: `src/pages/TraineeDetail.tsx` (`PlanCard`)

- [ ] **Step 1: Select the day.** In `src/lib/coachData.ts`, change the workouts select string to:

```ts
.select('id, date, created_at, title, duration_minutes, muscle_groups, source_plan_id, source_plan_day, exercises(name, muscle_group, sets, reps, weight, unit, order_index, exercise_db_id)')
```

Also add `created_at?: string | null;` to `TraineeWorkout`, if Task 8 hasn't already added `source_plan_day?: string | null;`.

- [ ] **Step 2: Use `dayOfSession` in PlanCard.** In `src/pages/TraineeDetail.tsx`, add the import:

```ts
import { dayOfSession } from '../lib/planProgress';
```

In `PlanCard`, replace the whole `const sessionDay = (() => { … })();` block with:

```ts
  const sessionDay = latest && dayGroups.length > 1 ? (dayOfSession(plan, latest) ?? dayGroups[0][0]) : (dayGroups[0]?.[0] ?? '');
```

- [ ] **Step 3: Type-check, test, build** (Task 13). Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/coachData.ts src/pages/TraineeDetail.tsx
git commit -m "feat(coach): plan adherence scores the recorded plan day"
```

---

### Task 10: Starter splits + `planStarters.ts` (TDD)

**Files:**
- Create: `src/config/planSplits.ts`
- Create: `src/lib/planStarters.ts`
- Test: `src/lib/planStarters.test.ts`

- [ ] **Step 1: Split data.** `src/config/planSplits.ts`:

```ts
// Ready-made splits for the coach's Assign sheet. Plain data — edit freely.
// Names match what Athlix users actually log, so a trainee's last weights
// prefill when they've done the exercise before.
export interface PlanSplit { key: 'full' | 'upper_lower' | 'ppl'; name: string; blurb: string; days: { label: string; exercises: string[] }[]; }

export const PLAN_SPLITS: PlanSplit[] = [
  {
    key: 'full', name: 'Full body', blurb: '1 day · whole body',
    days: [{ label: '', exercises: ['Barbell Back Squat', 'Bench Press', 'Seated Cable Row', 'Dumbbell Shoulder Press', 'Romanian Deadlift', 'Leg Raises'] }],
  },
  {
    key: 'upper_lower', name: 'Upper / Lower', blurb: '2 days',
    days: [
      { label: 'Upper', exercises: ['Bench Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Seated Cable Row', 'Dumbbell Curl', 'Tricep Pushdown'] },
      { label: 'Lower', exercises: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raises'] },
    ],
  },
  {
    key: 'ppl', name: 'Push / Pull / Legs', blurb: '3 days',
    days: [
      { label: 'Push', exercises: ['Bench Press', 'Incline Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Tricep Pushdown'] },
      { label: 'Pull', exercises: ['Lat Pulldown', 'Seated Cable Row', 'T-Bar Row', 'Hammer Curl', 'Dumbbell Curl'] },
      { label: 'Legs', exercises: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Calf Raises'] },
    ],
  },
];
```

- [ ] **Step 2: Write the failing tests.** `src/lib/planStarters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TraineeWorkout } from './coachData';
import { PLAN_SPLITS } from '../config/planSplits';
import { DEFAULT_REPS, DEFAULT_REST, DEFAULT_SETS, lastSetLookup, starterFromRecent, starterFromSplit, starterFromTemplate } from './planStarters';

const NOW = new Date('2026-10-02T12:00:00').getTime();
const w = (id: string, date: string, title: string, sets: [string, number, number][]): TraineeWorkout => ({
  id, date, title, duration_minutes: 40, muscle_groups: [], source_plan_id: null,
  exercises: sets.map(([name, weight, reps]) => ({ name, muscle_group: null, sets: 1, reps, weight, unit: 'lbs' })),
});

describe('lastSetLookup', () => {
  it('returns the top set from the most recent session with that exercise', () => {
    const last = lastSetLookup([
      w('a', '2026-09-20', 'A', [['Bench Press', 100, 8]]),
      w('b', '2026-09-28', 'B', [['Bench Press', 135, 5], ['Bench Press', 125, 8]]),
    ]);
    expect(last('bench press')).toEqual({ weight: 135, reps: 5 });
    expect(last('Squat')).toBeNull();
  });
});

describe('starterFromSplit', () => {
  it('builds named days with defaults and history weights', () => {
    const ppl = PLAN_SPLITS.find((s) => s.key === 'ppl')!;
    const st = starterFromSplit(ppl, (n) => (n === 'Bench Press' ? { weight: 135, reps: 5 } : null));
    expect(st.title).toBe('Push / Pull / Legs');
    expect(st.days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs']);
    const bench = st.days[0].rows[0];
    expect(bench).toEqual({ name: 'Bench Press', sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: 135, rest: DEFAULT_REST, note: '' });
    expect(st.days[1].rows[0].weight).toBe(0);
  });
});

describe('starterFromRecent', () => {
  it('turns distinct recent sessions into days, oldest first, max 4', () => {
    const st = starterFromRecent([
      w('1', '2026-09-30', 'Push', [['Bench Press', 135, 5], ['Bench Press', 135, 5]]),
      w('2', '2026-10-01', 'Pull', [['Lat Pulldown', 120, 10]]),
      w('3', '2026-09-10', 'Old', [['Leg Press', 300, 10]]),
    ], 'Sam', NOW)!;
    expect(st.title).toBe("Sam's program");
    expect(st.days.map((d) => d.label)).toEqual(['Push', 'Pull']);
    expect(st.days[0].rows[0]).toMatchObject({ name: 'Bench Press', sets: 2, reps: 5, weight: 135 });
  });
  it('keeps one day per repeated session (latest wins)', () => {
    const st = starterFromRecent([
      w('1', '2026-09-28', 'Push', [['Bench Press', 130, 5]]),
      w('2', '2026-10-01', 'Push', [['Bench Press', 140, 5]]),
    ], 'Sam', NOW)!;
    expect(st.days).toHaveLength(1);
    expect(st.days[0].label).toBe('');
    expect(st.days[0].rows[0].weight).toBe(140);
  });
  it('returns null with no recent sessions', () => {
    expect(starterFromRecent([w('3', '2026-09-01', 'Old', [['Leg Press', 300, 10]])], 'Sam', NOW)).toBeNull();
  });
});

describe('starterFromTemplate', () => {
  it('maps template exercises into one day', () => {
    const st = starterFromTemplate({ title: 'Arms', template_exercises: [{ name: 'Hammer Curl', default_sets: 4, default_reps: 12, default_weight: 30 }] });
    expect(st).toEqual({ title: 'Arms', days: [{ label: '', rows: [{ name: 'Hammer Curl', sets: 4, reps: 12, weight: 30, rest: DEFAULT_REST, note: '' }] }] });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run `npx vitest run src/lib/planStarters.test.ts`. Expected: FAIL, "Failed to resolve import ./planStarters".

- [ ] **Step 4: Implement.** `src/lib/planStarters.ts`:

```ts
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
```

- [ ] **Step 5: Run tests**

Run `npx vitest run`. Expected: PASS (planProgress + planStarters).

- [ ] **Step 6: Commit**

```bash
git add src/config/planSplits.ts src/lib/planStarters.ts src/lib/planStarters.test.ts
git commit -m "feat(assign): starter splits and pure plan-starter builders"
```

---

### Task 11: Assign sheet sub-components

**Files:**
- Create: `src/components/coach/assign/PlanExerciseRow.tsx`
- Create: `src/components/coach/assign/AssignStartStep.tsx`
- Create: `src/components/coach/assign/AssignPreviewStep.tsx`

- [ ] **Step 1: `PlanExerciseRow.tsx`**. This is the compact row. `PrescribeTile` and `formatRest` move here from AssignPlanSheet.

```tsx
import React from 'react';
import { AppIcon } from '../../../config/icons';
import { haptics } from '../../../lib/haptics';

export type DialField = 'sets' | 'reps' | 'weight' | 'rest';
export const formatRest = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;

interface RowData { name: string; sets: number; reps: number; weight: number; rest: number; note: string; }

interface Props {
  row: RowData;
  index: number;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onChange: (field: DialField, value: number) => void;
  onNote: (value: string) => void;
  onOpenDial: (field: DialField) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

// One line by default ("Bench Press · 3 × 10 · 135 lb"); tap to adjust.
// Keeps an 8-exercise program scannable instead of 32 steppers on screen.
export const PlanExerciseRow: React.FC<Props> = ({ row, index, expanded, isFirst, isLast, onToggle, onChange, onNote, onOpenDial, onMove, onRemove }) => {
  const [noteOpen, setNoteOpen] = React.useState(!!row.note);
  return (
    <div className="rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-3 text-left">
        <span className="shrink-0 w-5 text-center text-[12px] font-bold text-[var(--text-muted)]">{index + 1}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-[var(--text-primary)] truncate">{row.name}</span>
          <span className="block text-[12px] text-[var(--text-muted)] tabular-nums">
            {row.sets} × {row.reps}{row.weight ? ` · ${row.weight} lb` : ''} · {formatRest(row.rest)} rest{row.note ? ' · note' : ''}
          </span>
        </span>
        <span className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}><AppIcon name="ExpandDown" size="sm" /></span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <PrescribeTile label="Sets" value={row.sets} min={1} max={20} step={1} onChange={(v) => onChange('sets', v)} onOpenDial={() => onOpenDial('sets')} />
            <PrescribeTile label="Reps" value={row.reps} min={1} max={100} step={1} onChange={(v) => onChange('reps', v)} onOpenDial={() => onOpenDial('reps')} />
            <PrescribeTile label="Weight" value={row.weight} min={0} max={2000} step={5} unit="lb" onChange={(v) => onChange('weight', v)} onOpenDial={() => onOpenDial('weight')} />
            <PrescribeTile label="Rest" value={row.rest} min={0} max={600} step={15} formatValue={formatRest} onChange={(v) => onChange('rest', v)} onOpenDial={() => onOpenDial('rest')} />
          </div>
          {noteOpen ? (
            <input value={row.note} onChange={(e) => onNote(e.target.value)} autoFocus={!row.note}
              placeholder="Coaching note — tempo, RPE, cue…"
              className="w-full h-10 mt-2 rounded-xl px-3 text-[13px] outline-none"
              style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 text-[12px] font-semibold text-[var(--accent)]">+ Add note</button>
          )}
          <div className="flex items-center justify-end gap-1 mt-2">
            <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] disabled:opacity-25 rotate-180">
              <AppIcon name="ExpandDown" size="sm" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] disabled:opacity-25">
              <AppIcon name="ExpandDown" size="sm" />
            </button>
            <button type="button" onClick={onRemove} aria-label="Remove"
              className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: '#ff8080' }}>
              <AppIcon name="Trash" size="sm" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const PrescribeTile: React.FC<{
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  formatValue?: (v: number) => string; onChange: (v: number) => void; onOpenDial: () => void;
}> = ({ label, value, min, max, step, unit, formatValue, onChange, onOpenDial }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const bump = (d: number) => { haptics.tick(); onChange(clamp(value + d * step)); };
  return (
    <div className="relative flex h-[60px] w-full overflow-hidden rounded-xl border" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => bump(-1)} disabled={value <= min} aria-label={`Decrease ${label}`}
        className="flex h-full w-[38px] shrink-0 items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">−</span>
      </button>
      <button type="button" onClick={onOpenDial} aria-label={`Set ${label}`} className="flex flex-1 min-w-0 flex-col items-center justify-center gap-[2px]">
        <span className="flex items-baseline gap-1">
          <span className="font-victory tabular-nums text-[22px] leading-none font-black text-[var(--text-primary)]">{formatValue ? formatValue(value) : value}</span>
          {unit && <span className="text-[11px] font-semibold text-[var(--text-muted)]">{unit}</span>}
        </span>
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">{label}</span>
      </button>
      <button type="button" onClick={() => bump(1)} disabled={value >= max} aria-label={`Increase ${label}`}
        className="flex h-full w-[38px] shrink-0 items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">+</span>
      </button>
    </div>
  );
};
```

- [ ] **Step 2: `AssignStartStep.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../../config/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getTemplates } from '../../../lib/supabaseData';
import type { TraineeWorkout } from '../../../lib/coachData';
import { PLAN_SPLITS } from '../../../config/planSplits';
import { lastSetLookup, starterFromRecent, starterFromSplit, starterFromTemplate, type PlanStarter } from '../../../lib/planStarters';

interface Props { traineeName: string; traineeWorkouts: TraineeWorkout[]; onPick: (starter: PlanStarter | null) => void; }

// Step 1 of Assign: start from something sensible instead of an empty form.
export const AssignStartStep: React.FC<Props> = ({ traineeName, traineeWorkouts, onPick }) => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const lastSetFor = useMemo(() => lastSetLookup(traineeWorkouts), [traineeWorkouts]);
  const recent = useMemo(() => starterFromRecent(traineeWorkouts, traineeName), [traineeWorkouts, traineeName]);

  const openTemplates = async () => {
    if (!user) return;
    setLoadingTemplates(true);
    try { setTemplates(await getTemplates(user.id)); } catch { setTemplates([]); } finally { setLoadingTemplates(false); }
  };

  if (templates) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setTemplates(null)} className="text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-1 mb-1">
          <AppIcon name="Back" size="sm" /> Starting points
        </button>
        {templates.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)] text-center py-6">No templates yet. Use "Save as template" in the ⋯ menu while building a plan.</p>
        ) : templates.map((t) => (
          <StartCard key={t.id} icon="Duplicate" title={t.title || 'Template'} sub={`${t.template_exercises?.length ?? 0} exercises`} onClick={() => onPick(starterFromTemplate(t))} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-[var(--text-muted)]">Pick a starting point — you can change anything after.</p>
      <StartCard
        icon="History"
        title="Based on their recent training"
        sub={recent ? `${recent.days.length} day${recent.days.length === 1 ? '' : 's'} from the last 2 weeks, with their weights` : 'No sessions in the last 2 weeks'}
        disabled={!recent}
        accent
        onClick={() => recent && onPick(recent)}
      />
      <div className="grid grid-cols-3 gap-2">
        {PLAN_SPLITS.map((s) => (
          <button key={s.key} type="button" onClick={() => onPick(starterFromSplit(s, lastSetFor))}
            className="glass-card px-3 py-3 text-left active:scale-[0.98] transition-transform">
            <p className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">{s.name}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">{s.blurb}</p>
          </button>
        ))}
      </div>
      <StartCard icon="Duplicate" title="From my templates" sub={loadingTemplates ? 'Loading…' : 'Reuse a plan you saved'} onClick={openTemplates} />
      <StartCard icon="Plus" title="Blank" sub="Add exercises yourself" onClick={() => onPick(null)} />
    </div>
  );
};

const StartCard: React.FC<{ icon: 'History' | 'Duplicate' | 'Plus'; title: string; sub: string; accent?: boolean; disabled?: boolean; onClick: () => void }> = ({ icon, title, sub, accent, disabled, onClick }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className="w-full glass-card px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:opacity-45"
    style={accent && !disabled ? { borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' } : undefined}>
    <span className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl"
      style={accent && !disabled ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
      <AppIcon name={icon} size="md" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold text-[var(--text-primary)] truncate">{title}</span>
      <span className="block text-[12px] text-[var(--text-muted)] truncate">{sub}</span>
    </span>
  </button>
);
```

- [ ] **Step 3: `AssignPreviewStep.tsx`**

```tsx
import React from 'react';
import { AppIcon } from '../../../config/icons';
import type { AssignedPlan } from '../../../lib/assignedPlans';
import { planProgress } from '../../../lib/planProgress';
import { CoachPlanCardView } from '../../home/CoachPlanCardView';

interface Props {
  plan: AssignedPlan;
  coachName: string | null;
  traineeName: string;
  message: string;
  onMessage: (v: string) => void;
  busy: boolean;
  error: string;
  isEdit: boolean;
  onBack: () => void;
  onSend: () => void;
}

// Step 3 of Assign: exactly what the trainee will see on Home, plus an
// optional message, before anything is sent.
export const AssignPreviewStep: React.FC<Props> = ({ plan, coachName, traineeName, message, onMessage, busy, error, isEdit, onBack, onSend }) => (
  <div className="space-y-3">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">What {traineeName} will see</p>
    <CoachPlanCardView plan={{ ...plan, notes: message.trim() || null }} coachName={coachName} progress={planProgress(plan, [])} preview />
    <textarea value={message} onChange={(e) => onMessage(e.target.value)} rows={2}
      placeholder={`Message to ${traineeName} (optional)`}
      className="w-full rounded-2xl px-4 py-3 text-[14px] outline-none resize-none"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
    {error && <p className="text-[14px]" style={{ color: '#ff8080' }}>{error}</p>}
    <div className="flex gap-2">
      <button type="button" onClick={onBack} disabled={busy}
        className="h-14 px-5 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)] flex items-center gap-1" style={{ background: 'var(--bg-elevated)' }}>
        <AppIcon name="Back" size="sm" /> Edit
      </button>
      <button type="button" onClick={onSend} disabled={busy}
        className="flex-1 h-14 rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#000' }}>
        {busy ? <AppIcon name="Spinner" size="md" /> : isEdit ? 'Save changes' : `Send to ${traineeName}`}
      </button>
    </div>
  </div>
);
```

- [ ] **Step 4: Type-check** (Task 13, step 1). Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach/assign
git commit -m "feat(assign): start, compact exercise row, and preview step components"
```

---

### Task 12: Rewrite `AssignPlanSheet.tsx`

**Files:** Rewrite `src/components/coach/AssignPlanSheet.tsx`. Its props stay the same, so `TraineeDetail.tsx` needs no change.

- [ ] **Step 1: Replace the file contents with:**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { DialPicker } from '../log/DialPicker';
import { assignPlan, updatePlan, type AssignedPlan, type NewPlanExercise } from '../../lib/assignedPlans';
import { saveTemplate } from '../../lib/supabaseData';
import { useAuth } from '../../contexts/AuthContext';
import type { TraineeWorkout } from '../../lib/coachData';
import type { DialFieldKind } from '../../lib/exerciseTypes';
import { DEFAULT_REST, DEFAULT_SETS, DEFAULT_REPS, lastSetLookup, type PlanStarter } from '../../lib/planStarters';
import { AssignStartStep } from './assign/AssignStartStep';
import { AssignPreviewStep } from './assign/AssignPreviewStep';
import { PlanExerciseRow, type DialField } from './assign/PlanExerciseRow';

// Coach assigns (or edits) a plan in three steps: pick a starting point →
// adjust (compact rows, day tabs, whole-day set/rep chips) → preview exactly
// what the trainee sees, then send. Defaults everywhere, so the fastest path
// is two taps with no typing.
interface Props { open: boolean; traineeId: string; traineeName: string; traineeWorkouts?: TraineeWorkout[]; editingPlan?: AssignedPlan | null; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: number; reps: number; weight: number; rest: number; note: string; dayId: number };
type Day = { id: number; label: string };
type Step = 'start' | 'build' | 'preview';

const SCHEMES: [number, number][] = [[3, 5], [3, 8], [3, 10], [4, 12]];
const DIAL_KIND: Record<DialField, DialFieldKind> = { sets: 'sets', reps: 'reps', weight: 'weight', rest: 'rest' };
const DIAL_LABEL: Record<DialField, string> = { sets: 'Sets', reps: 'Reps', weight: 'Weight', rest: 'Rest' };

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, traineeWorkouts = [], editingPlan, onClose, onAssigned }) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>('start');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState<Day[]>([{ id: 0, label: '' }]);
  const [activeDayId, setActiveDayId] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const nextDayId = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [openDial, setOpenDial] = useState<{ rowIndex: number; field: DialField } | null>(null);
  const lastSetFor = useMemo(() => lastSetLookup(traineeWorkouts), [traineeWorkouts]);
  const coachName = profile?.trainer_display_name || profile?.full_name || null;

  const loadStarter = (s: PlanStarter | null) => {
    const ds = s?.days.length ? s.days : [{ label: '', rows: [] }];
    setTitle(s?.title ?? '');
    setDays(ds.map((d, i) => ({ id: i, label: d.label })));
    setRows(ds.flatMap((d, i) => d.rows.map((r) => ({ ...r, dayId: i }))));
    setActiveDayId(0);
    nextDayId.current = ds.length;
    setExpanded(null);
    setStep('build');
    if (!s) setPicking(true);
  };

  useEffect(() => {
    if (!open) return;
    setError(''); setBusy(false); setMenuOpen(false); setExpanded(null); setOpenDial(null); setPicking(false);
    if (editingPlan) {
      const dayIds = new Map<string, number>();
      const nextRows: Row[] = editingPlan.exercises.map((e) => {
        const label = e.day_label?.trim() || '';
        if (!dayIds.has(label)) dayIds.set(label, dayIds.size);
        return { name: e.name, sets: e.default_sets, reps: e.default_reps, weight: e.default_weight, rest: e.rest_seconds ?? DEFAULT_REST, note: e.note ?? '', dayId: dayIds.get(label)! };
      });
      const nextDays = [...dayIds.entries()].map(([label, id]) => ({ id, label }));
      setTitle(editingPlan.title);
      setMessage(editingPlan.notes ?? '');
      setRows(nextRows);
      setDays(nextDays.length ? nextDays : [{ id: 0, label: '' }]);
      setActiveDayId(0);
      nextDayId.current = Math.max(1, nextDays.length);
      setStep('build');
    } else {
      setTitle(''); setMessage(''); setRows([]); setDays([{ id: 0, label: '' }]); setActiveDayId(0); nextDayId.current = 1;
      setStep('start');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingPlan?.id]);

  const hasContent = rows.length > 0;
  const close = () => { onClose(); setStep('start'); };
  const requestClose = () => {
    if (step !== 'start' && hasContent && !window.confirm('Discard this plan? Your changes will be lost.')) return;
    close();
  };

  const multi = days.length > 1;
  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0];
  const dayRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.dayId === activeDay.id);

  const setField = (i: number, k: DialField, v: number) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const setNote = (i: number, v: string) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, note: v } : r)));
  const removeRow = (i: number) => { setRows((p) => p.filter((_, idx) => idx !== i)); setExpanded(null); };
  const move = (i: number, dir: -1 | 1) => setRows((p) => {
    const same = p.map((r, idx) => ({ r, idx })).filter(({ r }) => r.dayId === p[i].dayId);
    const pos = same.findIndex(({ idx }) => idx === i);
    const other = same[pos + dir];
    if (!other) return p;
    const next = [...p];
    [next[i], next[other.idx]] = [next[other.idx], next[i]];
    setExpanded(other.idx);
    return next;
  });
  const applyScheme = (sets: number, reps: number) => {
    haptics.tick();
    setRows((p) => p.map((r) => (r.dayId === activeDay.id ? { ...r, sets, reps } : r)));
  };

  const addDay = () => {
    const id = nextDayId.current++;
    setDays((d) => {
      const first = d.length === 1 && !d[0].label ? [{ ...d[0], label: 'Day 1' }] : d;
      return [...first, { id, label: `Day ${first.length + 1}` }];
    });
    setActiveDayId(id);
    haptics.tick();
  };
  const renameDay = (label: string) => setDays((d) => d.map((g) => (g.id === activeDay.id ? { ...g, label } : g)));
  const removeDay = () => {
    if (days.length <= 1) return;
    const n = dayRows.length;
    if (n && !window.confirm(`Remove ${activeDay.label || 'this day'} and its ${n} exercise${n > 1 ? 's' : ''}?`)) return;
    setRows((p) => p.filter((r) => r.dayId !== activeDay.id));
    const rest = days.filter((g) => g.id !== activeDay.id);
    setDays(rest.length === 1 ? [{ ...rest[0], label: '' }] : rest);
    setActiveDayId(rest[0].id);
    setMenuOpen(false);
  };
  const duplicateDay = () => {
    if (!dayRows.length) return;
    const id = nextDayId.current++;
    setDays((d) => [...d.map((g, i) => (i === 0 && !g.label ? { ...g, label: 'Day 1' } : g)), { id, label: `${activeDay.label || 'Day 1'} copy` }]);
    setRows((p) => [...p, ...dayRows.map(({ r }) => ({ ...r, dayId: id }))]);
    setActiveDayId(id);
    setMenuOpen(false);
  };

  const addExercise = (name: string) => setRows((p) => {
    if (p.some((r) => r.dayId === activeDay.id && r.name.toLowerCase() === name.toLowerCase())) return p;
    const last = lastSetFor(name);
    return [...p, { name, sets: DEFAULT_SETS, reps: last?.reps || DEFAULT_REPS, weight: last?.weight || 0, rest: DEFAULT_REST, note: '', dayId: activeDay.id }];
  });

  const recentExercises = useMemo<Exercise[]>(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const e of w.exercises || []) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: `${e.name}-${w.id}`, name: e.name, muscleGroup: e.muscle_group || 'Other', lastSession: { weight: e.weight, reps: e.reps, date: w.date, sets: e.sets, unit: 'lbs' } });
      }
    }
    return out;
  }, [traineeWorkouts]);

  const saveAsTemplate = async () => {
    setMenuOpen(false);
    if (!user || !rows.length) return;
    try {
      await saveTemplate(user.id, {
        title: title.trim() || 'Untitled plan',
        exercises: rows.map((r, i) => ({ name: r.name, muscle_group: null, default_sets: r.sets, default_reps: r.reps, default_weight: r.weight, order_index: i })),
      });
      toast.success('Saved as a reusable template');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save template.');
    }
  };

  const ordered = days.flatMap((d) => rows.filter((r) => r.dayId === d.id).map((r) => ({ ...r, day: multi ? d.label.trim() : '' })));
  const finalTitle = title.trim() || `${traineeName}'s program`;

  const goPreview = () => {
    setError('');
    if (multi) {
      const used = days.filter((d) => rows.some((r) => r.dayId === d.id)).map((d) => d.label.trim().toLowerCase());
      if (used.some((l) => !l)) { setError('Give every day a name.'); return; }
      if (new Set(used).size !== used.length) { setError('Two days have the same name — rename one.'); return; }
    }
    setStep('preview');
  };

  const draftPlan: AssignedPlan = {
    id: editingPlan?.id ?? 'preview', trainer_id: user?.id ?? '', trainee_id: traineeId, title: finalTitle,
    notes: message.trim() || null, status: 'active', created_at: new Date().toISOString(),
    exercises: ordered.map((r, i) => ({
      name: r.name, muscle_group: null, default_sets: r.sets, default_reps: r.reps, default_weight: r.weight,
      unit: 'lbs', order_index: i, day_label: r.day || null, rest_seconds: r.rest, note: r.note || null,
    })),
  };

  const send = async () => {
    setBusy(true); setError('');
    const exercises: NewPlanExercise[] = ordered.map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.weight, rest: r.rest, note: r.note, day: r.day || undefined }));
    const res = editingPlan
      ? await updatePlan(editingPlan.id, { title: finalTitle, notes: message, exercises })
      : await assignPlan(traineeId, { title: finalTitle, notes: message, exercises });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not send.'); return; }
    toast.success(editingPlan ? 'Plan updated' : `Sent to ${traineeName}`);
    onAssigned();
    close();
  };

  const heading = editingPlan ? 'Edit plan' : step === 'start' ? 'Assign a plan' : step === 'preview' ? 'Preview' : 'Build the plan';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={requestClose} style={{ background: 'rgba(3,5,9,0.94)' }}>
          <motion.div className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 440, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">{heading}</h2>
                <p className="text-[15px] text-[var(--text-secondary)] mt-1">For {traineeName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {step === 'build' && (
                  <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="More"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-[18px] leading-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>⋯</button>
                )}
                <button type="button" onClick={requestClose} aria-label="Close" className="h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  <AppIcon name="Close" size="sm" />
                </button>
              </div>
            </div>

            {menuOpen && step === 'build' && (
              <div className="mx-6 mb-2 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                <button type="button" onClick={saveAsTemplate} disabled={!rows.length} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)] disabled:opacity-40">Save as template</button>
                <button type="button" onClick={duplicateDay} disabled={!dayRows.length} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)] disabled:opacity-40">Duplicate {multi ? activeDay.label || 'day' : 'as a new day'}</button>
                {multi && <button type="button" onClick={removeDay} className="w-full px-4 py-3 text-left text-[14px] font-semibold" style={{ color: '#ff8080' }}>Remove {activeDay.label || 'this day'}</button>}
              </div>
            )}

            <div className="px-6 overflow-y-auto flex-1 pb-4">
              {step === 'start' && <AssignStartStep traineeName={traineeName} traineeWorkouts={traineeWorkouts} onPick={loadStarter} />}

              {step === 'preview' && (
                <AssignPreviewStep plan={draftPlan} coachName={coachName} traineeName={traineeName} message={message} onMessage={setMessage}
                  busy={busy} error={error} isEdit={!!editingPlan} onBack={() => setStep('build')} onSend={send} />
              )}

              {step === 'build' && (
                <>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${traineeName}'s program`}
                    className="w-full h-12 rounded-2xl px-4 text-[16px] font-semibold outline-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                  <p className="text-[12px] text-[var(--text-muted)] mt-2">Each day is one workout. Your trainee does them in order.</p>

                  <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-1 px-1">
                    {multi && days.map((d) => (
                      <button key={d.id} type="button" onClick={() => { setActiveDayId(d.id); setExpanded(null); }}
                        className="shrink-0 px-3 h-9 rounded-xl text-[13px] font-semibold"
                        style={d.id === activeDay.id
                          ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid transparent' }}>
                        {d.label || 'Day'}
                      </button>
                    ))}
                    <button type="button" onClick={addDay} className="shrink-0 px-3 h-9 rounded-xl text-[13px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <AppIcon name="Plus" size="sm" /> Day
                    </button>
                  </div>
                  {multi && (
                    <input value={activeDay.label} onChange={(e) => renameDay(e.target.value)} placeholder="Day name"
                      className="w-full h-9 mt-2 rounded-xl px-3 text-[13px] font-semibold outline-none"
                      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                  )}

                  {dayRows.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] shrink-0">All</span>
                      {SCHEMES.map(([s, r]) => {
                        const active = dayRows.every(({ r: row }) => row.sets === s && row.reps === r);
                        return (
                          <button key={`${s}x${r}`} type="button" onClick={() => applyScheme(s, r)}
                            className="px-2.5 h-8 rounded-lg text-[12px] font-bold tabular-nums"
                            style={active ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                            {s}×{r}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2 mt-3">
                    {dayRows.length === 0 ? (
                      <p className="text-[14px] text-[var(--text-muted)] text-center py-6">No exercises{multi ? ' in this day' : ''} yet.</p>
                    ) : dayRows.map(({ r, i }, pos) => (
                      <PlanExerciseRow key={`${r.name}-${i}`} row={r} index={pos} expanded={expanded === i}
                        isFirst={pos === 0} isLast={pos === dayRows.length - 1}
                        onToggle={() => setExpanded(expanded === i ? null : i)}
                        onChange={(f, v) => setField(i, f, v)} onNote={(v) => setNote(i, v)}
                        onOpenDial={(f) => setOpenDial({ rowIndex: i, field: f })}
                        onMove={(dir) => move(i, dir)} onRemove={() => removeRow(i)} />
                    ))}
                  </div>

                  <button type="button" onClick={() => setPicking(true)}
                    className="w-full h-12 mt-3 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
                    style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
                    <AppIcon name="Search" size="sm" /> Add exercise{multi && activeDay.label ? ` to ${activeDay.label}` : ''}
                  </button>
                  {error && <p className="text-[14px] mt-2" style={{ color: '#ff8080' }}>{error}</p>}
                </>
              )}
            </div>

            {step === 'build' && (
              <div className="px-6 pt-2 pb-6">
                <button type="button" disabled={!rows.length} onClick={goPreview}
                  className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  Preview & send
                </button>
              </div>
            )}
          </motion.div>

          {picking && (
            <div className="fixed inset-0 z-[80]" onClick={(e) => e.stopPropagation()}>
              <ExercisePicker recentExercises={recentExercises} defaultTab="recent" multiSelect
                contextLabel={multi ? `Adding to ${activeDay.label || 'this day'}` : `Adding to ${traineeName}'s plan`}
                onSelect={(ex) => addExercise(ex.name)}
                onLoadTemplate={(exs) => { exs.forEach((ex) => addExercise(ex.name)); setPicking(false); }}
                onClose={() => setPicking(false)} />
            </div>
          )}

          {openDial && rows[openDial.rowIndex] && (
            <DialPicker title={DIAL_LABEL[openDial.field]} fieldKind={DIAL_KIND[openDial.field]} inputType="weight_reps"
              initialValue={rows[openDial.rowIndex][openDial.field]} weightUnit="lbs"
              onClose={() => setOpenDial(null)}
              onConfirm={(v) => { setField(openDial.rowIndex, openDial.field, v); setOpenDial(null); }} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

- [ ] **Step 2: Type-check, lint, test, build** (Task 13). Expected: no new type errors. Lint shows no new problems in `AssignPlanSheet.tsx` or `assign/*`. Tests PASS. The build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach/AssignPlanSheet.tsx
git commit -m "feat(assign): start → build → preview flow with compact rows, day tabs and set/rep chips"
```

---

### Task 13: Verification commands (used by every task)

- [ ] **Step 1: Type-check `src/`.** The root config excludes `src/`, so create a temporary config outside the repo, for example in `/tmp/athlix-tsc/tsconfig.json`:

```json
{ "extends": "<REPO>/tsconfig.json", "compilerOptions": { "noEmit": true, "incremental": false, "jsx": "react-jsx" },
  "include": ["<REPO>/src/**/*.ts", "<REPO>/src/**/*.tsx", "<REPO>/src/vite-env.d.ts"], "exclude": ["<REPO>/node_modules"] }
```

Replace `<REPO>` with the absolute repo path. Then run `npx tsc -p /tmp/athlix-tsc/tsconfig.json`.

Expected: **exactly the 23 pre-existing errors**, in `ExerciseBlock.tsx`, `HapticPicker.tsx`, `RestTimerContext.tsx`, `aiCoach.ts`, `supabaseData.ts`, `main.tsx`, `Home.tsx` and `Timeline.tsx`, and none in files this plan touches. Also run `npx tsc --noEmit` (the Next app), which is expected to be clean.

- [ ] **Step 2: Tests.** Run `npx vitest run`. Expected: all PASS.

- [ ] **Step 3: Build.** Run `npx vite build --outDir /tmp/athlix-vbuild`. Expected: `✓ built`.

- [ ] **Step 4: Lint changed files.** Run `git diff --name-only HEAD~1 | grep -E "\.(ts|tsx)$" | xargs npx eslint --no-ignore`. Expected: no new problems beyond pre-existing `react/no-unescaped-entities` / `exhaustive-deps` items in untouched lines.

---

### Task 14: Test plan section 10

**Files:** Modify `docs/trainer-dashboard-test-plan.md`. Insert the following before the "Known gaps" heading.

- [ ] **Step 1: Add the section**

```markdown
## 10. Coach plan "Today" card and easy Assign

| ID | Steps | Expected |
|---|---|---|
| TDY-1 | Trainee with no active plan opens Home | No "From your coach" card. |
| TDY-2 | Coach assigns a Push/Pull/Legs plan → trainee opens Home | Card at the top: "From <coach> · Push / Pull / Legs", pills Push ● / Pull / Legs, "Today: Push", first 4 exercises with "3 × 10 @ … lb", Start Push. |
| TDY-3 | Trainee taps Start Push, logs, finishes | Home card: "Push done today ✓ · Next: Pull"; Push pill ticked; button reads "Train again". |
| TDY-4 | Next day, Start | Starts Pull (rotation). After Legs, it wraps to Push. |
| TDY-5 | Other day → pick Legs | Logger opens with the Legs exercises; afterwards the next day is Push. |
| TDY-6 | Two active plans | "Switch" shows both; picking one shows it on the card; starting it keeps it current on the next visit. |
| TDY-7 | Single-day plan | No pills; "Done N× this week" after sessions. |
| TDY-8 | Coach views the trainee after TDY-3 | The plan card says "3/3 exercises done · Push", with Pull/Legs not marked Missed. |
| TDY-9 | Coach logs a session for the trainee from the Pull day | The trainee's card counts Pull as done. |
| ASG-1 | Coach taps Assign | The starting-point screen shows: Based on their recent training / Full body · Upper/Lower · Push/Pull/Legs / From my templates / Blank. |
| ASG-2 | Tap Push / Pull / Legs → Preview & send → Send | Sent with no typing; the trainee gets the popup and the card. Weights prefill from the trainee's history where known. |
| ASG-3 | Trainee with no sessions in 14 days | "Based on their recent training" is disabled with "No sessions in the last 2 weeks". |
| ASG-4 | Day chips: tap 4×12 on Push | Every Push exercise becomes 4 × 12; the chip highlights. |
| ASG-5 | Tap a row | It expands to Sets/Reps/Weight/Rest tiles; "+ Add note" reveals the note field; move/remove work within the day. |
| ASG-6 | ⋯ → Save as template, then a new Assign → From my templates | The template appears and loads. |
| ASG-7 | Preview shows a message; Send | The trainee's card and popup show the message. |
| ASG-8 | Edit an existing plan | Opens straight into the builder (no starting points); the message is prefilled; Save changes works and keeps the message. |
| ASG-9 | Rename two days to the same name → Preview & send | Error: "Two days have the same name — rename one." |
| ASG-10 | Close with exercises added | Confirm "Discard this plan?". On the starting screen it closes freely. |
| DB-1 | Run `supabase/tests/plan_day_check.sql` | 3 lines, no BAD. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/trainer-dashboard-test-plan.md
git commit -m "docs(test-plan): coach plan Today card and easy Assign cases"
```

---

### Task 15: Deploy

- [ ] **Step 1:** Confirm the migration from Task 3 is applied (Task 3, step 4 query).
- [ ] **Step 2:** Run Task 13 steps 1–3 one last time.
- [ ] **Step 3:** Ask the user before pushing. On a yes, run `git push origin main`, then poll `gh api repos/gajeradhrumil38/Athlix_v2_1-main/commits/<sha>/status` until Vercel reports `success`.
