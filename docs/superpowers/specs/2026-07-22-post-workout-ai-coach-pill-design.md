# Post-Workout AI Coach Pill — Design Spec
**Date:** 2026-07-22
**Scope:** Per-exercise strength goals + real PR fix + WHOOP-style floating AI insight after finishing a workout
**Builds on:** `2026-06-04-ai-coach-expansion-design.md` (already implemented — `buildSystemPrompt()` in `AiChat.tsx` already includes workout history, PRs, MEV volume, progressive-overload trend, muscle recovery, and optional WHOOP/nutrition/running/skincare sections)

---

## Goal

Right now finishing a workout just saves it and navigates to Home — no feedback beyond a toast. This spec adds a WHOOP-style experience: a small floating pill appears after saving, goes "Analyzing…", then shows a personalized one-line AI take you can expand into a full message with comparison-to-last-workout and goal-progress context baked in, plus a way to keep chatting. It also fixes two real bugs found along the way: `FinishSheet`'s "New PRs" counter is dead code that always shows 0, and there's currently no way to set a concrete strength target (e.g. "Bench Press → 100kg × 5") to track progress against.

---

## 1. Goal model (new)

### Schema
New table, same RLS pattern as `exercise_type_overrides`:
```sql
CREATE TABLE public.exercise_goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  target_weight NUMERIC NOT NULL,
  target_reps INTEGER NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg','lbs')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved')),
  achieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```
RLS: `auth.uid() = user_id` for all four operations. One active goal per exercise per user is enforced at the application layer (not a DB constraint — a user can re-target after achieving one).

### CRUD
`getGoals(userId)`, `addGoal(userId, exerciseName, targetWeight, targetReps, unit)`, `updateGoal(userId, goalId, updates)`, `deleteGoal(userId, goalId)` — added to both `supabaseData.ts` and `localData.ts`, same dual-path convention as everything else in the data layer.

### Completion rule
A goal is "met" the moment any logged set reaches `weight >= target_weight AND reps >= target_reps` (normalized to the same unit). Checked at save time in `Log.tsx`'s `handleSave()` — for each exercise in the just-finished workout that has an active goal, scan its completed sets; if met, mark the goal `status: 'achieved'`, `achieved_at: now()`.

### UI — Progress page
New "Goals" section in `Progress.tsx`: list of active goals, each showing exercise name, target, and a progress bar (current best set for that exercise, from `personal_records`, vs. target — e.g. "82.5kg × 5 → 100kg × 5"). Add/edit/delete via a small sheet, following the existing sheet patterns in the log components (e.g. `GoalEditSheet.tsx`'s structure, though that component is for the unrelated weekly-day goal and won't be reused directly).

---

## 2. Real PR fix

**Current bug:** `FinishSheet.tsx:40-47` counts `s.isPR === true`, but that field is only ever set as transient local UI state in `ExerciseBlock.tsx` during logging (a 3-second badge) — it's never written onto the actual `Set` object that reaches `FinishSheet`. Real PR computation happens later, server-side, inside `saveWorkout()`. So "New PRs" in `FinishSheet` always reads 0.

**Fix:** Before showing `FinishSheet`, fetch `getPersonalRecords(userId)` and compute real PRs client-side: for each exercise in the workout, compare its best set this session (highest weight, then highest reps as tiebreak) against the existing PR row for that exercise name. Count exercises where the session's best beats the stored PR. This becomes the source for `FinishSheet`'s "New PRs" stat, and is also passed into the post-workout AI payload (§4).

---

## 3. Last-workout comparison helper (new)

New function `findLastSimilarWorkout(userId, finishedWorkout)` in `supabaseData.ts`:
- Query `getWorkouts(userId, { limit: 20, includeExercises: true })`, excluding the just-saved workout.
- Match by: same `title` (case-insensitive) if set, else by `muscle_groups` array overlap (Jaccard-style: >50% shared groups) — first match wins, most recent first.
- If found, compute deltas: total volume, total sets, duration, count of exercises in common.
- If nothing matches (first time doing this workout), return `null` — the AI prompt handles this explicitly (§4) rather than fabricating a comparison.

---

## 4. Shared AI core (refactor)

`AiChat.tsx` currently inlines the Gemini request logic (model selection + fallback, `thinkingConfig`, function-calling tools) and `buildSystemPrompt()` (workout history, PRs, MEV volume ranges, progressive-overload trend, muscle recovery, optional nutrition/running/WHOOP/skincare sections — all from the already-implemented `2026-06-04` spec). Both this existing chat and the new pill need the same underlying request path and the same rich context.

**Extract into `src/lib/aiCoach.ts`:**
- `buildSystemPrompt(userId, options)` — moved as-is from `AiChat.tsx`, unchanged behavior.
- `callGemini(systemPrompt, messages, options)` — the fetch-with-model-fallback logic (`gemini-2.5-flash` → `gemini-1.5-flash` on overload), reading the same `localStorage` key/model config.

`AiChat.tsx` imports both from the new module instead of defining them inline — pure refactor, no behavior change for existing chat.

---

## 5. Floating pill + drawer (new)

### Trigger
`Log.tsx`'s `handleSave()`, after `saveWorkout()` succeeds and PR/goal computation (§2, §1) and comparison lookup (§3) complete, dispatches:
```ts
window.dispatchEvent(new CustomEvent('athlix:workout-finished', {
  detail: { stats, realPrCount, goalUpdates, comparison } // comparison may be null
}));
```
Same pattern as the existing `athlix:open-ai` event. Fire-and-forget — does not block or delay the existing `navigate('/')` call.

### New component: `PostWorkoutCoachPill.tsx`
Mounted globally in `Layout.tsx` alongside `AiChat`, so it floats over Home (or wherever the user lands) regardless of route.

**States:**
1. **Idle** — not rendered, listening for the event.
2. **Analyzing** — small pill, bottom-right (near the existing FAB position, offset so they don't overlap), avatar + "Analyzing…" with a subtle pulse. Appears the instant the event fires.
3. **Teaser** — once the Gemini call resolves, pill morphs to show one truncated line: `{first name} · {first ~60 chars of the AI response}…`. Auto-dismisses after ~20s if untapped (slides away), so it never becomes permanent clutter.
4. **Expanded (drawer)** — tapping the teaser slides up a bottom sheet: full AI message, thumbs up/down (cosmetic local state only, no persistence — out of scope to build feedback storage for this), and a text input ("Ask AI anything").
   - Submitting text in that input **hands off to the real `AiChat`**: dispatches `athlix:open-ai`, closes the pill drawer, and seeds `AiChat`'s conversation with the insight message as the opening assistant turn plus the user's typed text as the first user turn. This avoids building a second parallel chat/function-calling engine — `AiChat` already has one, tested and working.

### Prompt construction
Using the shared `aiCoach.ts` core: `buildSystemPrompt()` (unchanged, already has WHOOP recovery baked in when connected) plus a specific instruction turn built from the event payload:
> "I just finished this workout: {stats}. {If comparison: 'Compared to my last similar session: {deltas}.' Else: 'This is the first time I've logged this workout.'} {If goalUpdates non-empty: 'Goal progress: {goalUpdates}.'} Give me a short, encouraging take and one concrete suggestion for today or tomorrow."

The existing `buildSystemPrompt()` already includes WHOOP recovery data when connected (per the 2026-06-04 spec), so no separate WHOOP fetch is needed here — it's already in context.

### No API key configured
The pill still appears and still shows "Analyzing…" briefly, but instead of calling Gemini, the teaser state shows "Set up AI Coach to get workout insights" — tapping expands directly into the existing `ApiKeySetupModal` rather than a message drawer. Once configured, subsequent workout finishes get the real flow.

---

## 6. Error handling

- Gemini call fails/network error → pill quietly disappears after the analyzing state times out (~10s); no error toast, this is a nice-to-have feature, not a critical path.
- No comparison workout found → handled explicitly in the prompt (§5), not treated as an error.
- No active goals → `goalUpdates` is empty, simply omitted from the prompt.
- User navigates away before the pill resolves → component unmounts cleanly (it's mounted in `Layout.tsx`, so it persists across routes within the app shell; only a full reload would drop the in-flight request, which is acceptable).

---

## 7. Component/file changes summary

| File | Change |
|---|---|
| `supabase/migrations/` (new) | `exercise_goals` table + RLS |
| `src/lib/supabaseData.ts` | `getGoals`/`addGoal`/`updateGoal`/`deleteGoal`, `findLastSimilarWorkout` |
| `src/lib/localData.ts` | Same CRUD, localStorage-backed |
| `src/pages/Progress.tsx` | New Goals section (list + add/edit/delete sheet) |
| `src/components/log/FinishSheet.tsx` | Real PR count (§2) instead of dead `isPR` field |
| `src/pages/Log.tsx` | `handleSave()` computes PRs/goal updates/comparison, dispatches `athlix:workout-finished` |
| `src/lib/aiCoach.ts` (new) | Extracted `buildSystemPrompt` + `callGemini` from `AiChat.tsx` |
| `src/components/ai/AiChat.tsx` | Imports from `aiCoach.ts` instead of inline definitions; accepts seeded opening turns for the pill hand-off |
| `src/components/ai/PostWorkoutCoachPill.tsx` (new) | The pill/drawer itself |
| `src/components/layout/Layout.tsx` | Mounts `PostWorkoutCoachPill` |

---

## 8. Testing (manual — no test framework in this repo)

- Log a workout with an exercise that has an active goal at/near target → verify goal marked achieved, mentioned in the AI message.
- Log the same workout title twice → verify comparison deltas appear on the second.
- Log a workout with a never-before-seen title/muscle combo → verify "first time" framing, no fabricated comparison.
- Beat an existing PR → verify `FinishSheet` shows the correct count (not 0).
- Test with no Gemini key configured → pill still appears, routes to `ApiKeySetupModal`.
- Test with WHOOP connected vs. not → verify recovery-aware suggestion only appears when connected (already handled by existing `buildSystemPrompt`, just confirm it still flows through).
- Type a message in the pill drawer → verify it hands off cleanly into `AiChat` with context preserved.

---

## 9. Out of scope

- Feedback (thumbs up/down) persistence — cosmetic only for now.
- Goal types other than per-exercise strength target (volume/frequency/bodyweight goals — explicitly deferred).
- Editing the pill's auto-dismiss timing via settings.
- Server-side Gemini proxy (consistent with existing architecture decision in the 2026-06-04 spec).
