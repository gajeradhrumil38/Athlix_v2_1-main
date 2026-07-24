# Progress Page: Exercise History + Monthly Volume Fix — Design

**Status:** Approved by user, 2026-07-24. Ready for implementation planning.

## Problem

Three related gaps in `src/pages/Progress.tsx`'s Overview tab:

1. **Monthly Volume month-picker is broken for anything older than ~30 days.** The section lets you page back through past months, but its underlying data (`workouts` state) is fetched with `getWorkouts(user.id, { startDate: thirtyDaysAgo })` — a hard 30-day window. Paging back further always renders "No workouts logged in [Month]," even when the user trained that month, because the data was never fetched. (`exercises` state, fetched via `getExerciseRowsWithWorkoutDates`, is *not* date-bounded — the bug is that Monthly Volume cross-references the bounded `workouts` array instead of using the already-unbounded `exercises` data.)
2. **No way to see a single exercise's own history.** The app tracks full workout history and has a working PR system (`personal_records` table), but there's no view that answers "what did I do last time on Bench Press, and what's my best ever?" without manually scrolling Timeline.
3. **No growth visualization per exercise.** No chart showing a specific lift's trend over time — critical for spotting plateaus, which the app's own AI Coach system prompt already reasons about internally (`progressionReport` in `lib/aiCoach.ts`) but never surfaces visually to the user.

## Research grounding

- Production strength-training apps (Hevy, Strive, and others reviewed by lifters) consistently do three things well: mark PRs directly on the trend line (not just as a number in a box), make plateaus/deloads visually obvious rather than requiring mental math, and show both top-set weight (strength) and volume (total work) since they tell different stories.
- This app already has `recharts` installed and in active production use *in this exact file* — the "Weight Trend" chart (`Progress.tsx`, Weight tab) has an established, polished visual language: gradient-filled `AreaChart`, dashed `CartesianGrid`, custom dark tooltip, accent-colored dots. The new exercise-growth chart reuses this exact pattern rather than introducing a new visual style or library.

## Non-goals

- No estimated-1RM calculation — not requested, and it's a guess-based derived number the user didn't ask for. Skip it.
- No multi-range chart toggle (3mo/6mo/1yr/All) for v1 — show full history in one chart. Cuttable scope; can be added later without disrupting this design.
- No changes to how PRs are computed or stored — this feature reads the existing `personal_records` table, it doesn't touch PR-detection logic.
- No changes to the "Last 30 days" summary card or the sessions/week stat — those are correctly, deliberately scoped to 30 days already; nothing here should widen that.

## Data model grounding (confirmed by reading the actual schema, not assumed)

- `public.exercises` has **no per-set JSON column**. Each logged *set* becomes its own row (`sets` is hardcoded to `1` per row by the `save_workout_with_sets` RPC — see `supabase/schema.sql` around the `completed_sets` loop). So "Bench Press, 3 sets" is 3 separate `exercises` rows sharing the same `workout_id` and `name`.
- To reconstruct one training session for an exercise: group `exercises` rows by `(workout_id, name)`. Each row in the group is one set (`reps` × `weight` × `unit`).
- `personal_records.best_weight` is kept continuously in the user's *current* preferred unit — a bulk `convertWeight()` pass runs whenever the user changes their unit preference (`src/lib/supabaseData.ts:965-966`). So reading `best_weight` directly (no ad-hoc conversion) is safe and matches how `GoalsSection.tsx` already does it.
- Exercise identity for history lookups is **exact string match on `name`** (not fuzzy) — matches the convention already used in `lib/aiCoach.ts`'s `progressionReport`/`weeklyVolume`. Fuzzy matching only happens at the search step (finding which exercise the user means), not at the history-lookup step (once a name is chosen, it's exact).

## Part 1: Fix Monthly Volume's month filter

Rewrite the Monthly Volume section's data derivation (`calculateMuscleVolume`, `currentWeekWorkouts`/`previousWeekWorkouts` — poorly named, actually month-scoped) to filter and group directly from the unbounded `exercises` array by date, instead of cross-referencing the 30-day-bounded `workouts` array. Concretely:

- Filter `exercises` where `ex.workouts.date` falls within the selected month (using the already-attached per-exercise workout date, exactly as `setsByMuscleWeek` already does a few lines below it in the same file).
- Extend `getExerciseRowsWithWorkoutDates` to also select `muscle_groups` on the workouts query (currently `select('id,date')` → `select('id,date,muscle_groups')`) and attach it to each returned exercise row (alongside the existing `workouts: { date }` shape). This preserves the existing muscle-group-fallback path (when an individual exercise lacks its own `muscle_group`) with zero extra network calls — one additional column, not an additional query.
- `workouts` state itself stays exactly as-is (still 30-day-bounded) — it's correctly scoped for the "Last 30 days" card and sessions/week math, which this fix must not touch.

## Part 2: Exercise History view

**Entry point:** a new search card added to the Overview tab, placed directly after the "Last 30 days" summary card and before "Monthly Volume" — it's a primary lookup tool the user reaches for often, not a passive stat, so it belongs near the top rather than buried below the muscle-volume breakdown. All existing Overview cards stay in place otherwise.

**Search behavior:**
- Scoped only to exercise names the user has actually logged (derived from their own `exercises` history), never the full exercise catalog.
- Before typing: list shows the user's exercises **most-recently-trained first**.
- While typing: reuses the existing `fuzzyFilter`/`fuzzyScore` utilities from `src/lib/fuzzySearch.ts` — no new matching logic.

**Detail view (opens on tapping a search result — a full sheet, not an inline expansion):**

1. **Header:** exercise name + muscle group.
2. **Growth chart** (Recharts `AreaChart`, styled identically to the existing Weight Trend chart — same gradient fill, grid, tooltip, dot conventions):
   - One point per training session (grouped by `workout_id`), full history (no range toggle in v1).
   - **Weight / Volume toggle**: Weight view plots each session's top set (max weight logged that session); Volume view plots total tonnage that session (`Σ reps × weight` across the session's set-rows).
   - The session matching the user's current PR gets a distinguishing marker on the line (larger dot / reference marker) — the PR isn't just a stat box number, it's visible in context on the trend.
   - A small trend badge (↑ Improving / → Plateau / ↓ Declining) above the chart, computed the same way `lib/aiCoach.ts`'s `progressionReport` already compares recent vs. prior sessions for this exercise — surfacing an existing internal comparison the AI Coach already makes, not new logic.
3. **Last time:** most recent session's date + every set from that session, e.g. "85kg × 6, 85kg × 6, 82.5kg × 5" (not a single collapsed number — the user explicitly asked to see "this set and this reps").
4. **All-time best:** pulled directly from `personal_records` for this exact exercise name (weight × reps, achieved date) — the existing PR system, not a recomputation.
5. **Frequency:** sessions this week, sessions this month, weekly average over a trailing window (mirrors the shape of `trainingStats()` in `lib/aiCoach.ts`, but scoped to this one exercise instead of all training).

## Testing plan

No automated test suite in this repo (`npm test` is a no-op placeholder) — verification is `npx tsc -p src/tsconfig.json --noEmit` against the known 10-error/23-line baseline, `npm run build`, and manual QA:
- Monthly Volume: page back 3+ months to a month with real logged data (not just the last 30 days) and confirm it now shows real numbers instead of "No workouts logged."
- Search: type a partial exercise name, confirm only exercises actually logged by the user appear (not the full catalog); confirm the default (untyped) list is most-recent-first.
- Detail view: pick an exercise with multiple sessions and multiple sets per session, confirm "Last time" shows every individual set, "All-time best" matches the value shown elsewhere in the app for that exercise's PR, and the chart's PR-marked point matches that same value.
- Weight/Volume toggle: confirm switching preserves the same x-axis (sessions) but changes the y-values sensibly.
