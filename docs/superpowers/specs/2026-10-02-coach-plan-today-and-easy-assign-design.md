# Coach Plans: Trainee "Today" Card and Easy Assign — Design

**Date:** 2026-10-02
**Status:** Approved design, not yet implemented
**Part of:** the assign-flow improvement programme. This is project 1 of 4. The other three are scheduling (plan days on dates), a plan library for reuse across trainees, and feedback and adherence tracking. They each get their own spec later.

## Problem

Assigned plans are hard to use from both ends.

- **Trainee side.**
  - A trainee only finds their plan through a one-time popup, the Notifications card, or Settings → My Coach.
  - For a multi-day plan, nothing says which day to do next or which days are done.
- **Coach side.**
  - The Assign sheet opens empty: plan name, "No exercises yet", and buttons for Add exercise, Add day and Save as template.
  - A first-time coach doesn't know what a day is, what the trainee will see, or where to start.
  - Every exercise shows four steppers plus a note field, so building a plan is a lot of tapping and typing.

## Goals

1. A coached trainee opens Home and sees what to do today, plus one button to start it.
2. A coach can assign a sensible plan in about 2 taps, with no typing, and can still fine-tune anything.
3. Every session records which plan day it was, so rotation and adherence are exact.

Out of scope here: dates and weekdays, assigning to many trainees, trainee feedback.

## Decisions (agreed)

| Question | Decision |
|---|---|
| How "next day" is chosen | **Rotation**: the day after the last completed day of the plan, wrapping from the last day back to Day 1. If nothing is done yet, Day 1. "Other day" lets the trainee override it. |
| Several active plans | **One current plan** on the card: the active plan most recently trained from, otherwise the newest assigned. "Switch" lists the others; starting one makes it current. Nothing is stored for this. |
| Where it lives | **A card at the top of Home only.** No nav change. It is hidden when there is no active plan. |
| Tracking the day | **Save the day on the workout** (new column). Sessions without it fall back to inferring the day from their exercises. |
| How Assign guides coaches | **Pick a starting point, then build**, kept to minimal typing and choosing. |

## Part 1: Trainee "From your coach" card (Home)

`src/components/home/CoachPlanCard.tsx`. Rendered at the top of `Home.tsx` when the trainee has at least one active plan.

- **Header:** "From <coach name> · <plan title>". The coach name comes from `getMyCoaches()`, matched on `trainer_id`. A **Switch** link appears when there is more than one active plan; it opens a sheet listing them.
- **Day strip** (multi-day plans only): one pill per day in plan order. A ✓ means done in the last 7 days; ● marks the suggested next day.
- **Body:** the suggested day's name, then its first 4 exercises as "Name · sets × reps @ weight lb", each with the coach's note when there is one, then "+N more".
- **Primary button:** "Start <day>". It goes to `/log` with `recommendedExercises` (including `weight`), `suggestedTitle`, `sourcePlanId` and **`sourcePlanDay`**.
- **Secondary button:** "Other day" opens a sheet listing every day with its ✓; tapping one starts that day.
- **Done today:** "Day 1 done today ✓ · Next: Day 2". The primary button becomes a quieter "Train again".
- **Single-day plan:** no strip; it shows "Done N× this week".
- Tapping the title opens `/my-coach`.

The same component takes a `preview` prop (no buttons, no data fetch, plan passed in). The coach's Preview & send step uses it (Part 3).

## Part 2: Data and logic

### Migration: `supabase/migrations/20261002010000_workout_source_plan_day.sql`

- `ALTER TABLE workouts ADD COLUMN IF NOT EXISTS source_plan_day text;` The value is nullable: NULL means unknown, and an empty string means a single-day plan.
- Recreate `save_workout_with_sets` with a new trailing parameter `p_source_plan_day text DEFAULT NULL`.
  - Drop the current 7-parameter signature first, so PostgREST never sees two overloads.
  - The body is unchanged except for two additions:
    - Store `source_plan_day`.
    - **Validate the plan link:** if `p_source_plan_id` isn't a row in `assigned_plans` with `trainee_id = v_user_id`, store NULL for both the plan link and the day. This closes the "unchecked plan link" known gap.
- You run it in the Supabase SQL Editor, as with the previous migration.

### Carrying the day through

- `saveWorkout()` (`src/lib/supabaseData.ts`) takes `source_plan_day?: string | null` and passes `p_source_plan_day`.
- `Log.tsx` reads `location.state.sourcePlanDay` into a ref next to `sourcePlanIdRef` and sends it on save.
- These callers all pass `sourcePlanDay`: `CoachPlanCard`, `MyCoach.tsx`, `AssignedPlanModal.tsx`, `PlanPreviewModal.tsx`, and `CoachLogSession.tsx` (its plan-day start card).
- A single-day plan passes `''`.

### Pure logic: `src/lib/planProgress.ts`

This file has no React and no Supabase calls.

- `dayOfSession(plan, workout)`: returns `workout.source_plan_day` when it matches one of the plan's day labels. Otherwise it returns the label whose exercises overlap the session's exercises most. Ties go to the earlier day in plan order.
- `planProgress(plan, sessions, now)` returns `{ days: { label, doneRecently, lastDone }[], nextDay, doneToday, sessionsThisWeek }`, where "recently" and "this week" both mean the last 7 days.
  - `sessions` are the trainee's workouts with `source_plan_id === plan.id`.
  - The latest session is ordered by `date`, then `created_at`.
  - `nextDay` is the day after the latest session's day, wrapping to the first. With no sessions, it is the first day.
- `currentPlan(plans, sessions)`: the active plan with the most recent linked session, otherwise the plan with the newest `created_at`.

### Fetching

`getMyPlanSessions(planIds)` in `src/lib/assignedPlans.ts` makes one query on `workouts`:

```
id, date, created_at, source_plan_id, source_plan_day, exercises(name)
```

It filters on `source_plan_id in planIds` and the last 60 days, ordered by date descending.

### Coach side

`PlanCard` in `TraineeDetail.tsx` uses `dayOfSession` instead of its own best-match code, so "Day 2 · 100%" is exact for sessions logged after the migration. The trainee query in `coachData.ts` also selects `source_plan_day`.

## Part 3: Coach Assign sheet (`AssignPlanSheet.tsx`)

### Step 1: Starting point (new plans only)

Four large cards, styled like the CoachLogSession start chooser:

1. **Based on their recent training.**
   - Each distinct session in the trainee's last 14 days becomes one day, up to 4, newest last.
   - Exercises and sets come from what they did, using their top set per exercise.
   - Day names are the session titles, or "Day N".
2. **Ready split.** Full body (1 day), Upper / Lower (2), or Push / Pull / Legs (3).
   - Days are pre-named and pre-filled with 4–5 standard exercises.
   - Weight is the trainee's last top set for that exercise when known, otherwise 0.
   - The starter lists live in `src/config/planSplits.ts`, as plain data.
3. **From my templates.** The existing template loader, moved out of the exercise picker.
4. **Blank.** The current empty builder.

Editing an existing plan skips this step.

### Step 2: Build

Minimal typing and choosing:

- **Name and days.** The plan name is auto-filled (the split name, "<Trainee>'s program", or the template title). Day names are auto-filled too. Both stay editable but are never required.
- **Day tabs.** Days show as tabs across the top: `Day 1 | Day 2 | + Day`. The old stacked list with inline day headers goes away. The active tab is the target for "Add exercise".
- **Hint.** A one-line hint under the header: "Each day is one workout. Your trainee does them in order."
- **Compact exercise rows.** Each row reads "Bench Press · 3 × 10 · 135 lb".
  - Tapping a row expands its −/+ tiles for Sets, Reps, Weight and Rest.
  - "Add note" is a small link that reveals the note field.
  - Move up/down and delete stay in the expanded row.
- **Day scheme chips.** Each day has quick chips (`3×5 · 3×8 · 3×10 · 4×12`) that set sets and reps on every exercise in that day.
- **Defaults.** New exercises default to 3 × 10, 90 s rest, and the trainee's last weight.
- **Menu.** "Save as template" and "Duplicate day" move into a ⋯ menu.

### Step 3: Preview and send

- The footer button is **Preview & send**, available once there is at least one exercise.
- The preview renders `CoachPlanCard` in `preview` mode with this plan.
- It adds an optional **Message to <trainee>** field, which saves to `assigned_plans.notes`. The trainee sees it in the new-plan popup and in My Coach.
- **Send to <trainee>** calls `assignPlan` / `updatePlan`, which already accept `notes`.
- Validation (unique, non-empty day names) runs here. Because names are auto-filled, it rarely triggers.

## Part 4: Edge cases and testing

| Case | Behaviour |
|---|---|
| No coach or no active plan | The card is hidden. |
| Plan deleted or archived | The card drops it. Workouts keep their history (`source_plan_id` is set to NULL by the existing foreign key). |
| A day renamed after sessions were logged | Those sessions fall back to exercise inference. |
| Coach logs a session from a plan day | It carries `source_plan_day`, so it counts toward rotation. |
| Two sessions on the same date | Ordered by `created_at`. |
| Unsaved logger draft with sets | Start keeps the draft. This is Log.tsx's existing rule and is unchanged. |
| Trainee hasn't shared workouts | No effect on the trainee's own card. The coach preview uses the plan only. |
| "Based on recent training" with no recent sessions | The card is disabled, with the subtitle "No sessions in the last 2 weeks". |

**Testing**

- Add Vitest as a dev dependency and set `"test": "vitest run"` in `package.json`.
- `src/lib/planProgress.test.ts` covers:
  - first day when there are no sessions
  - rotation and wrap-around
  - same-date tie
  - stored day versus inferred day, including a renamed day
  - choosing the current plan
  - `doneToday`
  - a single-day plan
- Add **section 10** to `docs/trainer-dashboard-test-plan.md` with manual cases for the card, Switch, Other day, Done today, the four Assign starting points, the day scheme chips, and Preview & send.
- Add a separate rolled-back check script, `supabase/tests/plan_day_check.sql` (the permissions script revokes the link midway, so it is kept separate):
  - A foreign `p_source_plan_id` is stored as NULL.
  - A valid plan and day are stored.

## Dependencies and order

1. Commit the current uncommitted work first: the coach logger (`CoachLogSession`, the `ActiveWorkout` coach props, the TraineeDetail Log button).
2. Migration, then `saveWorkout` and Log.tsx plumbing.
3. `planProgress.ts` and its tests.
4. `CoachPlanCard` on Home, plus `sourcePlanDay` in every start path.
5. Coach `PlanCard` switched to `dayOfSession`.
6. AssignPlanSheet: starting points, then compact builder, then preview and send.
