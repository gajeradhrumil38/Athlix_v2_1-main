# Today's Session Card (Home) — Design

**Date:** 2026-10-02
**Status:** Approved design

## Problem

When a trainee starts a coach's plan day, they're sent to the full-screen logger. For simply following a plan ("did it, did it, did it"), that's heavy. You can't see the session from Home, and you have to go back into the logger to tick things off.

## Decisions (agreed)

| Question | Decision |
|---|---|
| Who uses it | The **trainee**, on their **Home**. |
| What creates it | The trainee taps **Start** on the "From your coach" card, or on a day in My Coach. No coach push and no database change. |
| How it relates to the full logger | **One shared session.** The card is a compact view of the same in-progress workout (draft) the full logger uses. Ticks carry over both ways, and either one finishes it. |

## What the trainee sees

A **"Today's session"** card at the top of Home. It replaces the coach card while a session is in progress, and it also appears for any in-progress workout, including one started in the normal logger.

- **Header:**
  - the session title
  - "N of M done", with a thin progress bar
  - "Started X min ago"
  - a ⋯ menu with **Open full logger** and **Discard session** (which asks for confirmation)
- **Exercise list:**
  - Scrollable inside the card, with a maximum height of about 420 px.
  - Each row has a muscle-group colour bar, the name and the muscle label.
  - Below the name, a summary: "3 × 10 @ 135 lb" when every set is the same, otherwise the sets listed ("135×10 · 135×8 · 125×8").
  - The coach's note shows when there is one.
  - The first exercise that isn't done is badged **Up next**.
- **Done button:** a large round ✓ on each row.
  - Tapping it marks every set done. Empty weight and reps are filled from the prescription first.
  - Tapping again undoes it: sets are unticked, but the numbers stay.
- **Edit:** tapping a row expands one line per set, with −/+ for weight (5 lb steps) and reps, a tick per set, a remove-set ×, and **+ Set** (which copies the last set).
- **+ Add exercise:** the standard exercise picker, with multi-select. New exercises prefill from the trainee's own last session for that exercise.
- **Finish session:** enabled once at least one set is done. It goes to `/log?finish=1`, where the logger resumes the session and opens its normal finish screen, so saving, PRs, the celebration and the plan link all work as usual.

## How it works

- **`src/lib/workoutDraft.ts`** (new) holds what moves out of `Log.tsx`:
  - the draft key, the 8-hour expiry, and read/write/clear helpers
  - the function that creates a new in-progress workout
  - the function that builds a session's exercises from a plan
  - a new helper that turns a plan day into a ready-to-go session

  Storage changes:
  - The draft moves from session storage to **local storage**, so it survives the phone closing the app.
  - A draft still in session storage is picked up and moved over once.
  - Every save or clear fires a window event, so the Home card updates live.
- **The plan link lives on the workout.** `WorkoutState` gains optional `sourcePlanId` and `sourcePlanDay` fields.
  - `Log.tsx` writes them when it starts from a plan and saves from them.
  - This replaces the two page-memory fields, so a resumed session keeps its plan link. It also fixes an older bug: starting a plan while an unfinished draft existed used to attach the new plan's link to the old workout.
- **`src/lib/sessionChecklist.ts`** (new, pure, unit-tested) holds the checklist actions:
  - progress counts
  - mark an exercise done or undone
  - update a set, tick a set, add or remove a set
  - add exercises
- **Components** (all new except `CoachPlanCard`):
  - `TodaySessionCard` and `SessionExerciseRow` in `src/components/home/`.
  - `HomeTrainingSlot` shows `TodaySessionCard` when a draft exists, otherwise `CoachPlanCard`.
  - `CoachPlanCard` gains an `onStartDay` prop: Start creates the draft in place. If an existing draft has logged sets, it first asks "Replace your in-progress workout?".
  - My Coach's Start creates the draft and goes to Home.
- **`Log.tsx` and `?finish=1`:** when a draft exists, the logger resumes it and opens the finish screen.

## Edge cases

| Case | Behaviour |
|---|---|
| Draft older than 8 hours | It expires, as today. |
| Nothing done yet | Finish is disabled. |
| Plan deleted mid-session | It still saves; the database drops the stale plan link. |
| Two tabs open | The last write wins, as with drafts today. |

## Testing

- Vitest unit tests for `sessionChecklist.ts`:
  - marking done fills from the prescription, and undo keeps the numbers
  - progress counts and "Up next"
  - adding a set copies the last one, and removing a set works
  - an exercise is "done" only when all of its sets are done
- Manual cases in `docs/trainer-dashboard-test-plan.md` section 11.
