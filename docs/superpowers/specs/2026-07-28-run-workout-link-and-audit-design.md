# Run ↔ Workout Link + Delete Cascade, and Full-Flow Audit — Design

**Goal:** Deleting a run from Run History also deletes its corresponding workout log entry (which clears it from the Exercise Log and Calendar too), and a full code-level audit of the running feature's start-to-end flow to catch leftover inconsistencies from tonight's many rounds of design changes.

**Architecture:** Two independent pieces. Part 1 adds a real foreign-key link between `runs` and `workouts` (only populated going forward) and threads it through save/load/delete. Part 2 is a read-and-fix pass, not new architecture — no design decisions, just systematic verification.

---

## Part 1: Run ↔ Workout link + cascading delete

### Current state (confirmed by reading the code)

- `ActiveRun.tsx`'s `handleStop()` creates a `runs` row (`saveRun` local + `saveRunToCloud`) and, only when logged in, a **separate** `workouts` row (`saveWorkout`) with title "Outdoor Run". These two rows have no relationship to each other today — `saveWorkout`'s return value is discarded.
- `Calendar.tsx` reads workout days via `getWorkouts(user.id, ...)` — the same `workouts` table `saveWorkout` writes to. Deleting the linked workout row is therefore sufficient to clear a run from Calendar too; no separate Calendar-specific code is needed.
- Anonymous/local-only users (no `user` from `useAuth()`) never get a `workouts` row created for a run in the first place — the `if (user) { ... saveWorkout ... }` guard already exists. So this feature only applies to logged-in users, which is also the only case where a link is possible.

### Schema change

New migration, additive and nullable — no existing data touched:

```sql
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL`: if a workout is ever removed some other way (e.g. directly from Calendar), the run row doesn't break — it just loses its link instead of becoming a dangling foreign key.

### Writing the link

In `handleStop()`, after `saveWorkout(...)` succeeds, capture its returned row's `id` and issue one more update using the `cloudId` already returned from `saveRunToCloud()`:

```ts
const workoutRow = await saveWorkout(user.id, { ... });
if (cloudRunId != null) {
  await supabase.from('runs').update({ workout_id: workoutRow.id }).eq('id', cloudRunId);
}
```

This requires restructuring `handleStop()` slightly: today `saveRunToCloud` is a fire-and-forget `.then()` that only shows a toast on failure. To get `cloudRunId` for the link step, it needs to be awaited (matching how `saveWorkout` is already awaited immediately below it) rather than fired-and-forgotten. Failure to link (e.g. offline) fails silently the same way the existing `saveWorkout` toast-on-failure does — it does not block the rest of `handleStop()` or throw.

### Reading the link

`loadRunsFromCloud()` in `storage.ts`: add `workout_id` to the `select(...)` list and map it onto `SavedRun.workoutId?: string`.

### Cascading the delete

`RunHistory.tsx`'s `handleDelete(run)`: after the existing local (`deleteRun`) + cloud (`deleteRunFromCloud`) delete calls, if `run.workoutId` is set, also call the existing `deleteWorkout(run.workoutId)` (already imported/used elsewhere in the codebase for Calendar's own delete flow). Best-effort — if it fails, the run itself is still deleted; a failure here doesn't block or roll back the run deletion, matching the existing best-effort pattern used for `deleteRunFromCloud`.

### Explicit limitation (not building this)

Runs saved before this ships have `workout_id = NULL` — deleting an old run will not find a workout to cascade to, and no backfill/heuristic-match against historical data is planned (that's the fragile approach already ruled out for new runs, and retrofitting it for old data carries the same false-match risk). If historical backfill turns out to matter later, that's a separate follow-up.

---

## Part 2: Full-flow code audit

Read-only investigation (no browser/device available), covering, in order: idle screen → start-confirm dialog → running state → pause → resume → stop-confirm dialog → finish screen → no-run-detected screen → history list → history detail overlay.

Files in scope: `ActiveRun.tsx`, `RunHistory.tsx`, `RunMap.tsx`, `RunRouteBackground.tsx`, `useRunTracking.ts`, `useGPS.ts`, `storage.ts`, `gpsCalculations.ts`.

Checking for:
- Leftover inconsistent styling from the many rounds of changes made tonight (font sizes, colors, spacing that got updated in one screen but not its counterpart).
- Dead code (unused props, functions, styles left behind by a since-superseded change).
- Logic bugs (stale closures, incorrect conditionals, off-by-one issues).
- Old-data edge cases: a `SavedRun` saved before `elevationGain`, `cloudId`, or (after Part 1) `workoutId` existed should not crash or render incorrectly when those fields are `undefined`.

Findings get fixed as part of the same pass rather than just reported, same as every other fix this session — each still goes through `tsc`/`npm run build` before committing.

---

## Testing

- `npx tsc -p src/tsconfig.json --noEmit` must match the existing 21-line baseline after every change.
- `npm run build` must succeed after every change.
- No live/device testing available in this environment — flagged explicitly wherever that matters, same as prior work this session.
