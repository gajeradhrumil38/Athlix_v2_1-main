# Coach Session Card (Trainee Overview) — Design

**Date:** 2026-10-02
**Status:** Approved design
**Builds on:** `2026-10-02-todays-session-card-design.md` (the trainee's Home card stays as it is)

## Goal

During an in-person session, the coach ticks off exercises on the trainee's page as the trainee finishes them, then saves the session to the trainee's log.

## Where it goes

A card pinned at the top of the trainee page's Overview tab:
- directly under the **Log session / Assign plan** buttons
- full width, not part of the draggable widget grid
- shown only when the trainee shares Workouts

## States

### Idle: no coach draft for this trainee

- **With an active plan:** the card shows the trainee's next plan day. It reuses `CoachPlanCardView` with the eyebrow "Next for <name>", a day strip ticked from the trainee's logged sessions, and the day's exercises.
  - **Start <day>** begins that day in the card.
  - **Other day** picks another day.
  - **Other start** opens the existing start popup (repeat last session, any plan day, blank). Picking an option there also starts the session in the card instead of opening the full logger.
- **Without a plan:** a small "Train with <name>" card with a **Start session** button, which opens the same popup.

### Running: a coach draft exists with at least one exercise

- The shared `TodaySessionCard`, labelled "Session with <name>":
  - progress, **Up next**, ✓ per exercise, per-set edit
  - **+ Add exercise**, prefilled from the **trainee's** history, with the trainee's recent exercises in the picker
- **⋯ → Open full logger** continues the same draft at `/coach/trainee/<id>/log` (start = resume). **⋯ → Discard** clears it after a confirm.
- **Finish** opens the existing "Save to <name>'s log" review. Saving writes the trainee's workout (lb, linked to the plan day), clears the draft and refreshes the page.

## How it works

- **Storage.** The card uses the coach's existing per-trainee draft (`readCoachDraft` / `writeCoachDraft`), which the full coach logger already uses. Nothing new is stored.
- **`TodaySessionCard` gains optional props:**
  - `label`
  - `historyUserId`: whose last session prefills an added exercise
  - `recentExercises`
  - `readCurrent`: how to re-read the latest draft for the async prefill

  The defaults keep the trainee Home behaviour unchanged.
- **`CoachPlanCardView`** gains an optional `eyebrow` prop.
- **`CoachLogStartModal`** gains an optional `onPick`. When it's set, the modal calls it instead of navigating.
- **New shared pieces**, used by both the card and the full coach logger:
  - `setsToSave` moves from `CoachLogSession` into the pure `sessionChecklist.ts`. It saves only ticked sets if any are ticked, otherwise every set with a value.
  - `saveCoachSession` (in `lib/coachLog.ts`) does the actual save.
  - `traineeRecentExercises`, also in `lib/coachLog.ts`.
  - The review dialog moves into its own `CoachSessionReview` component.
- **Next day.** The trainee's logged workouts already include the plan link, the day, the date, the save time and the exercise names. That's everything `currentPlan` and `planProgress` need, so the coach side reuses them as-is.

## Testing

- Unit tests for `setsToSave`: only ticked sets when any are ticked, otherwise every set with a value, and empty sets are dropped.
- Unit test: a trainee workout, as the coach sees it, drives `planProgress` (rotation).
- Manual cases: test-plan section 12.
