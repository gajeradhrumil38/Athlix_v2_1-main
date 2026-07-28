# Run ↔ Workout Link + Delete Cascade, and Full-Flow Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deleting a run from Run History also deletes its corresponding workout log entry (which clears it from the Exercise Log and Calendar too, since Calendar reads the same `workouts` table), and a full code-level audit of the running feature's start-to-end flow to fix leftover inconsistencies from tonight's rounds of design changes.

**Architecture:** Add a nullable `workout_id` foreign key on the `runs` table, populate it once when a run finishes (logged-in users only, since that's the only case a `workouts` row exists at all), read it back alongside the rest of a run's cloud data, and cascade-delete through it. The audit is a separate, unrelated read-and-fix pass over the same feature's files — no shared architecture with the link work, just bundled in the same plan per the approved design.

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres), no test runner in this project — verification is `npx tsc -p src/tsconfig.json --noEmit` (must match the existing 21-line baseline) and `npm run build` (must succeed), matching how every other change has been verified this session.

---

### Task 1: Add `workout_id` column to `runs`

**Files:**
- Create: `supabase/migrations/20260728000001_runs_workout_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Links a run to the workout log entry created alongside it (only happens
-- for logged-in users — see ActiveRun.tsx's handleStop()), so deleting a
-- run from Run History can cascade-delete the matching Log/Calendar entry.
-- Nullable and additive: existing runs get NULL and simply have nothing to
-- cascade to when deleted, which is the expected/documented behavior for
-- runs saved before this shipped.
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration to the live database**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with `project_id` for "AthlixV2" (`mrntwydykqsdawpklumf`), `name: "runs_workout_id"`, and the SQL above as `query`. This applies it live AND records it in Supabase's own migration history — the file in `supabase/migrations/` is the git-tracked mirror of that, not a separate step that needs a separate apply.

- [ ] **Step 3: Verify the column exists**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'runs' and column_name = 'workout_id';
```
Expected: one row, `workout_id`, `uuid`, `YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260728000001_runs_workout_id.sql
git commit -m "$(cat <<'EOF'
Add workout_id link to runs table

Nullable, additive — lets a run be cascade-deleted alongside its
workout log entry once ActiveRun.tsx starts populating it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Thread `workoutId` through `storage.ts`

**Files:**
- Modify: `src/features/running/utils/storage.ts`

- [ ] **Step 1: Add `workoutId` to the `SavedRun` interface**

In the interface near the top of the file (currently has `id`, `cloudId?`, `path`, `distance`, `duration`, `pace`, `timestamp`, `splits?`, `elevationGain?`, `fromCloud?`), add:

```ts
  // Supabase workouts.id this run's Log/Calendar entry lives at, if one
  // was created (only happens for logged-in users — see ActiveRun.tsx's
  // handleStop()). Undefined for runs saved before this existed, or for
  // any run that never got a workout entry in the first place.
  workoutId?: string;
```

- [ ] **Step 2: Add a `linkRunToWorkout` function**

Add this new exported function right after `saveRunToCloud` (which already exists at line ~141):

```ts
export async function linkRunToWorkout(runId: number, workoutId: string): Promise<void> {
  try {
    await supabase.from('runs').update({ workout_id: workoutId }).eq('id', runId);
  } catch { /* best-effort — a failed link just means this run won't cascade-delete its workout later */ }
}
```

- [ ] **Step 3: Read `workout_id` back in `loadRunsFromCloud`**

Find the existing `loadRunsFromCloud` function. Change its `select(...)` call from:

```ts
      .select('id, run_ts, distance, duration, pace, path, splits, elevation_gain')
```

to:

```ts
      .select('id, run_ts, distance, duration, pace, path, splits, elevation_gain, workout_id')
```

And in the `.map((r) => ({ ... }))` below it, add one more field to the returned object (after `elevationGain`):

```ts
      workoutId: (r.workout_id as string | null) ?? undefined,
```

- [ ] **Step 4: Verify**

```bash
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
```
Expected: `21` (unchanged baseline).

- [ ] **Step 5: Commit**

```bash
git add src/features/running/utils/storage.ts
git commit -m "$(cat <<'EOF'
Read/write workout_id on SavedRun

linkRunToWorkout() writes it once a run's workout log entry is
created; loadRunsFromCloud() reads it back so RunHistory can cascade
deletes through it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Populate the link in `handleStop()`

**Files:**
- Modify: `src/features/running/pages/ActiveRun.tsx:418-485` (the `handleStop` function)

- [ ] **Step 1: Import `linkRunToWorkout`**

Find the existing import from `../utils/storage` (currently `import { saveRun, getRuns, saveRunToCloud, loadRunsFromCloud, mergeRuns } from '../utils/storage';`) and add `linkRunToWorkout` to it:

```ts
import { saveRun, getRuns, saveRunToCloud, loadRunsFromCloud, mergeRuns, linkRunToWorkout } from '../utils/storage';
```

- [ ] **Step 2: Replace the cloud-save and workout-save blocks**

Replace this exact block (the two `if (user) { ... }` blocks after `setAllRuns((prev) => [...prev, saved]);`):

```ts
    if (user) {
      // Awaited (not fire-and-forget) so a failure surfaces instead of
      // silently losing the dedicated run record (path/splits/pace) even
      // though the workout-history entry below still saves successfully.
      saveRunToCloud(user.id, saved).then((cloudId) => {
        if (cloudId == null) toast.error('Run saved on this device, but cloud sync failed.');
      });
    }
    if (user) {
      const durationMinutes = Math.max(1, Math.round(summary.duration / 60000));
      const roundedDist = Math.max(0, Number(displayDist.toFixed(2)));
      try {
        await saveWorkout(user.id, {
          title: 'Outdoor Run',
          date: format(new Date(summary.timestamp), 'yyyy-MM-dd'),
          duration_minutes: durationMinutes,
          notes: `Live run tracking – ${roundedDist.toFixed(2)} ${distanceUnit}`,
          exercises: [{
            name: 'Running', muscle_group: 'Cardio',
            completed_sets: [{ reps: durationMinutes, weight: roundedDist, unit: distanceUnit }],
          }],
        });
        toast.success('Run synced to workout history');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Run saved locally, sync failed.';
        toast.error(msg);
      }
    }
```

with:

```ts
    let cloudRunId: number | null = null;
    if (user) {
      // Awaited (not fire-and-forget) so a failure surfaces instead of
      // silently losing the dedicated run record (path/splits/pace), and
      // so its id is available below to link this run to its workout log
      // entry once that's saved too.
      cloudRunId = await saveRunToCloud(user.id, saved);
      if (cloudRunId == null) toast.error('Run saved on this device, but cloud sync failed.');
    }
    if (user) {
      const durationMinutes = Math.max(1, Math.round(summary.duration / 60000));
      const roundedDist = Math.max(0, Number(displayDist.toFixed(2)));
      try {
        const workoutRow = await saveWorkout(user.id, {
          title: 'Outdoor Run',
          date: format(new Date(summary.timestamp), 'yyyy-MM-dd'),
          duration_minutes: durationMinutes,
          notes: `Live run tracking – ${roundedDist.toFixed(2)} ${distanceUnit}`,
          exercises: [{
            name: 'Running', muscle_group: 'Cardio',
            completed_sets: [{ reps: durationMinutes, weight: roundedDist, unit: distanceUnit }],
          }],
        });
        toast.success('Run synced to workout history');
        if (cloudRunId != null) {
          // Best-effort: if this fails, the run and workout both still
          // exist and saved correctly — it just won't cascade-delete
          // later, same as a run that predates this feature entirely.
          void linkRunToWorkout(cloudRunId, workoutRow.id);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Run saved locally, sync failed.';
        toast.error(msg);
      }
    }
```

- [ ] **Step 3: Verify**

```bash
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
npm run build 2>&1 | grep -iE "error|✓ built|Compiled successfully"
```
Expected: `21`, then `✓ built` and `✓ Compiled successfully` with no `error` lines.

- [ ] **Step 4: Commit**

```bash
git add src/features/running/pages/ActiveRun.tsx
git commit -m "$(cat <<'EOF'
Link a run to its workout log entry when both save successfully

saveRunToCloud is now awaited (was fire-and-forget) so its id is
available to pass to linkRunToWorkout() once the workout entry saves
too — needed for RunHistory's delete to be able to cascade to it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cascade the delete in `RunHistory.tsx`

**Files:**
- Modify: `src/features/running/pages/RunHistory.tsx:638-656` (the `handleDelete` function)

- [ ] **Step 1: Import `deleteWorkout`**

Add this new import line near the other imports (after the `useAuth` import):

```ts
import { deleteWorkout } from '../../../lib/supabaseData';
```

- [ ] **Step 2: Add the cascade delete**

Replace this exact block:

```ts
  const handleDelete = (run: SavedRun) => {
    if (isDemo(run)) {
      toast('Demo runs are for preview only', { icon: '👟' });
      setConfirmDelete(null);
      return;
    }
    // Remove from localStorage
    deleteRun(run.id);
    // Remove from cloud (best-effort) — must use cloudId, not id: for a run
    // that exists both locally and in the cloud, `id` is the local
    // Date.now()-based id (mergeRuns keeps it so the localStorage delete
    // above still resolves), which never matches a real Supabase row.
    if (user && run.fromCloud && run.cloudId != null) void deleteRunFromCloud(run.cloudId);
    setLocalRuns((prev) => prev.filter((r) => r.id !== run.id));
    setCloudRuns((prev) => prev.filter((r) => r.id !== (run.cloudId ?? run.id)));
    if (selected?.id === run.id) setSelected(null);
    setConfirmDelete(null);
    toast.success('Run deleted');
  };
```

with:

```ts
  const handleDelete = (run: SavedRun) => {
    if (isDemo(run)) {
      toast('Demo runs are for preview only', { icon: '👟' });
      setConfirmDelete(null);
      return;
    }
    // Remove from localStorage
    deleteRun(run.id);
    // Remove from cloud (best-effort) — must use cloudId, not id: for a run
    // that exists both locally and in the cloud, `id` is the local
    // Date.now()-based id (mergeRuns keeps it so the localStorage delete
    // above still resolves), which never matches a real Supabase row.
    if (user && run.fromCloud && run.cloudId != null) void deleteRunFromCloud(run.cloudId);
    // Cascade to the linked workout log entry (Exercise Log + Calendar
    // both read from the same workouts table, so this clears both).
    // Best-effort — a run saved before workoutId existed has nothing to
    // cascade to, and a failure here doesn't undo the run delete above.
    if (user && run.workoutId) void deleteWorkout(user.id, run.workoutId);
    setLocalRuns((prev) => prev.filter((r) => r.id !== run.id));
    setCloudRuns((prev) => prev.filter((r) => r.id !== (run.cloudId ?? run.id)));
    if (selected?.id === run.id) setSelected(null);
    setConfirmDelete(null);
    toast.success('Run deleted');
  };
```

- [ ] **Step 3: Verify**

```bash
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
npm run build 2>&1 | grep -iE "error|✓ built|Compiled successfully"
```
Expected: `21`, then `✓ built` and `✓ Compiled successfully` with no `error` lines.

- [ ] **Step 4: Commit**

```bash
git add src/features/running/pages/RunHistory.tsx
git commit -m "$(cat <<'EOF'
Cascade-delete a run's workout log entry from Run History

Deleting a run now also removes its linked workouts row, if one
exists — clears it from the Exercise Log and Calendar too, since both
read from the same table. Runs saved before workoutId existed simply
have nothing to cascade to.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full-flow code audit

**Files (read, and fix in place if something's clearly broken):**
- `src/features/running/pages/ActiveRun.tsx`
- `src/features/running/pages/RunHistory.tsx`
- `src/features/running/components/RunMap.tsx`
- `src/features/running/components/RunRouteBackground.tsx`
- `src/features/running/hooks/useRunTracking.ts`
- `src/features/running/hooks/useGPS.ts`
- `src/features/running/utils/storage.ts`
- `src/features/running/utils/gpsCalculations.ts`

This task is a read-and-fix pass, not new architecture — there's no single "test" for it. Work through it as a checklist:

- [ ] **Step 1: Read `ActiveRun.tsx` top to bottom**

Confirm, specifically: the idle screen's Goal card and stats row styling still matches what was landed on (chip picker, lime "VIEW RUN HISTORY", ring+glow Goal icon); the running/paused merged "active" block (single `key="active"` motion.div, `layout`-animated Pause/Resume and Stop/Finish buttons) still reads as one coherent block, not a leftover split; the finish screen and no-run-detected screen both have the `RunRouteBackground` + spotlight-gradient + scroll-following backdrop treatment; `MIN_VALID_RUN_KM` and `MIN_PR_ELIGIBLE_KM` are both still defined and used exactly once each; no orphaned `isStoppingRef`-adjacent dead code from the double-submit fix.

- [ ] **Step 2: Read `RunHistory.tsx` top to bottom**

Confirm: `MiniRoute`/`RunCardMapPanel`-equivalent map thumbnail on the list cards still uses the `brightness(2.6) contrast(1.3)` tile boost; the list card's delete icon (moved into the header this session) and the detail overlay's cascade-delete (Task 4 above) don't conflict — both should be reachable and both should fire the same `handleDelete`; the detail overlay's hero/stat-row/splits styling matches Task 3/4's sibling changes in `ActiveRun.tsx` exactly (108px hero, `lineHeight: 1.05`, plain 15px stat units, vertical splits with connectors); `bestPace`/`isPR` still apply the `MIN_PR_ELIGIBLE_KM` qualification.

- [ ] **Step 3: Read `RunMap.tsx` top to bottom**

Confirm: the directional heading-arrow marker and its dot fallback are both still wired correctly (`bearing !== null` branch); the Scan/Locate buttons still have `isolation: isolate` + the elevated z-index (2000) and spring-based `whileTap`/`whileHover`; `MapFollowController`'s `dragstart`/`zoomstart` listeners are still attached/detached correctly in its `useEffect` cleanup.

- [ ] **Step 4: Read `RunRouteBackground.tsx` top to bottom**

Confirm: the `.rrbg .leaflet-tile` brightness/contrast boost is present and the outer wrapper's `filter` no longer includes a `brightness()` reduction (must stay blur+saturate only, per the earlier fix — reintroducing a brightness reduction here would silently re-break map visibility).

- [ ] **Step 5: Read `useRunTracking.ts` and `useGPS.ts` top to bottom**

Confirm: auto-pause (`AUTO_PAUSE_STATIONARY_MS`), elevation-gain accumulation (`MIN_ELEVATION_DELTA_METERS`), and heading capture (`pos.coords.heading`) are each implemented exactly once, with no duplicate/conflicting logic from earlier iterations.

- [ ] **Step 6: Read `storage.ts` and `gpsCalculations.ts` top to bottom**

Confirm: `SavedRun`'s optional fields (`cloudId`, `elevationGain`, `workoutId` from Task 2) are all actually optional everywhere they're read — no `run.workoutId!` or similar non-null assertions that would throw on an old run that predates a field; `calculateBearing`/`calculateDistance` are only defined once each (not duplicated between this file and `RunMap.tsx`).

- [ ] **Step 7: Fix anything found, verify, and commit**

For each concrete issue found in Steps 1-6 (not stylistic nitpicks — actual bugs, dead code, or inconsistencies), fix it, then run:

```bash
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
npm run build 2>&1 | grep -iE "error|✓ built|Compiled successfully"
```

Expected: `21`, then `✓ built` and `✓ Compiled successfully`. Commit each distinct fix separately (matching how every other fix has been committed this session — one focused commit per concern, not one giant "audit fixes" commit), with a message explaining what was found and why it mattered. If Steps 1-6 turn up nothing wrong, report that plainly instead of inventing changes to justify the pass.

---

## Self-Review Notes

- **Spec coverage:** Part 1 (schema + write + read + cascade) → Tasks 1-4. Part 2 (audit) → Task 5. Both spec sections covered.
- **Type consistency:** `SavedRun.workoutId?: string` (Task 2) matches `run.workoutId` usage in Task 4 and `workoutRow.id` (a UUID string, matching `saveWorkout`'s return type) passed into `linkRunToWorkout(runId: number, workoutId: string)` in Task 3 — `cloudRunId` is a `number | null` matching `saveRunToCloud`'s existing return type, narrowed to `number` before use via the `cloudRunId != null` check.
- **No placeholders:** every step has exact file paths, exact before/after code, and exact verification commands.
