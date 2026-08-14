# Slice 1 — WHOOP Activity Sync + "Hardest Activity" Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each WHOOP activity (Weight Training, Running, …) into a `whoop_activities` table synced by the daily recommendation job, and make "which activity cost me the most strain" obvious in the WHOOP card. The table starts accruing the per-activity history the Slice 2 strain-cost model will train on.

**Architecture:** The `training-recommendation` edge function already fetches the raw WHOOP workouts response each run. Add a sync step that parses activities fully and upserts them into `whoop_activities`. The WHOOP card (`WhoopDashboard`) already renders activities via `WorkoutCard`; add a compact "hardest recently" summary + a highlight on the top-strain card. No new fetches, no cron dependency (runs whenever the recommendation generates — daily on Home open).

**Tech Stack:** Supabase (Postgres + RLS + Edge Function/Deno), React 18 + TS (Vite SPA), Supabase MCP for migration + deploy.

**Production safety:** Tasks 4 (migration) and 5 (function deploy) mutate the live project. Prior session guidance: the user pre-authorized production steps ("its yes"); still narrate each before running.

**Test user:** `f91e83fe-f010-429c-9c13-05377f6c57b9`.

---

### Task 1: Migration — `whoop_activities` table

**Files:**
- Create: `supabase/migrations/20260814000000_whoop_activities.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Persisted WHOOP activities (per-workout strain, HR, energy, distance) so the
-- app shows activity history without reopening the WHOOP app, and so the
-- per-exercise strain-cost model (personalized-v2) has training data.
create table if not exists public.whoop_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whoop_id bigint not null,
  date date not null,
  sport_id integer,
  sport_name text,
  started_at timestamptz,
  ended_at timestamptz,
  strain numeric,
  average_heart_rate integer,
  max_heart_rate integer,
  kilojoules numeric,
  distance_meter numeric,
  zones jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, whoop_id)
);

alter table public.whoop_activities enable row level security;

create policy "whoop_activities_select_own"
on public.whoop_activities for select
using (auth.uid() = user_id);

create index if not exists whoop_activities_user_date_idx
  on public.whoop_activities (user_id, date desc);
```

- [ ] **Step 2: Confirm it is additive and idempotent**

Re-read: `create table if not exists`, RLS enabled, owner-select policy, index. No writes policy needed — only the service-role edge function writes (bypasses RLS).

---

### Task 2: Edge function — sync activities during generation

**Files:**
- Modify: `supabase/functions/training-recommendation/index.ts`

- [ ] **Step 1: Add a full-activity parser (keep the existing `parseWhoopWorkouts` for the load math)**

Add near the other parsers:

```ts
type SyncActivity = {
  whoop_id: number; date: string; sport_id: number | null; sport_name: string;
  started_at: string; ended_at: string; strain: number | null;
  average_heart_rate: number | null; max_heart_rate: number | null;
  kilojoules: number | null; distance_meter: number | null; zones: Record<string, number>;
};

const SPORT_NAMES: Record<number, string> = {
  0: 'Activity', 1: 'Running', 16: 'Cycling', 35: 'Swimming', 44: 'Walking',
  45: 'Weight Training', 63: 'Hiking', 71: 'CrossFit', 126: 'Yoga', 127: 'Pilates',
  169: 'HIIT', 189: 'Rowing', 190: 'Elliptical', 231: 'Jump Rope', 232: 'Rock Climbing',
  257: 'Pickleball', 264: 'Dance', 268: 'Jiu Jitsu', 269: 'Triathlon',
};

function parseSyncActivities(raw: any): SyncActivity[] {
  return ((raw?.records ?? []) as any[])
    .filter((r) => r.id != null && (r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE'))
    .map((r) => {
      const s = r.score ?? {};
      const z = s.zone_duration ?? {};
      return {
        whoop_id: Number(r.id),
        date: parseWhoopDate(r.start),
        sport_id: r.sport_id != null ? Number(r.sport_id) : null,
        sport_name: SPORT_NAMES[Number(r.sport_id)] ?? 'Workout',
        started_at: String(r.start),
        ended_at: String(r.end),
        strain: Number.isFinite(Number(s.strain)) ? Number(s.strain) : null,
        average_heart_rate: s.average_heart_rate ?? null,
        max_heart_rate: s.max_heart_rate ?? null,
        kilojoules: s.kilojoule ?? null,
        distance_meter: s.distance_meter ?? null,
        zones: {
          zone_zero: z.zone_zero_milli ?? 0, zone_one: z.zone_one_milli ?? 0,
          zone_two: z.zone_two_milli ?? 0, zone_three: z.zone_three_milli ?? 0,
          zone_four: z.zone_four_milli ?? 0, zone_five: z.zone_five_milli ?? 0,
        },
      };
    })
    .filter((a) => a.date && a.whoop_id);
}

async function syncWhoopActivities(sb: any, userId: string, rawWorkouts: any) {
  const activities = parseSyncActivities(rawWorkouts);
  if (!activities.length) return 0;
  const rows = activities.map((a) => ({ user_id: userId, ...a, synced_at: new Date().toISOString() }));
  const { error } = await sb.from('whoop_activities').upsert(rows, { onConflict: 'user_id,whoop_id' });
  if (error) { console.error('whoop_activities upsert failed:', error.message); return 0; }
  return rows.length;
}
```

- [ ] **Step 2: Return the raw workouts from `getWhoopData` so it can be synced**

In `getWhoopData`, add `rawWorkouts: fresh.get(\`workouts:${suffix}\`) ?? { records: [] }` to the returned object.

- [ ] **Step 3: Call the sync inside `generateRecommendation`**

After the `whoop`/`gym` fetch resolves, add (non-fatal):

```ts
const activitiesSynced = await syncWhoopActivities(sb, userId, (whoop as any).rawWorkouts ?? { records: [] }).catch(() => 0);
```

Add `activities_synced: activitiesSynced` into the snapshot's `whoop` jsonb so the sync is observable.

- [ ] **Step 4: Confirm the load path is unchanged**

`computeLoad` still uses `whoop.cycles`; `parseWhoopWorkouts` still feeds any existing use. The sync is purely additive.

---

### Task 3: WHOOP card — surface the hardest activity

**Files:**
- Modify: `src/features/whoop/components/WhoopDashboard.tsx`

- [ ] **Step 1: Compute the top-strain activity for the shown window**

Where `workouts` is in scope (the Workouts section, ~line 698), derive:

```ts
const hardest = workouts.reduce<WhoopWorkout | null>(
  (best, w) => (w.strain != null && (!best || w.strain > (best.strain ?? -1)) ? w : best),
  null,
);
```

- [ ] **Step 2: Add a one-line "hardest" summary above the collapsible list**

Inside the Workouts section, above the `showWorkouts` list, when `hardest?.strain != null`:

```tsx
<div className="flex items-center justify-between mb-2" style={{ fontSize: 10, fontWeight: 700 }}>
  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Hardest recently</span>
  <span style={{ color: 'white' }}>
    {hardest.sport_name} · <span style={{ color: '#f97316' }}>{hardest.strain!.toFixed(1)}</span>
  </span>
</div>
```

- [ ] **Step 3: Badge the top-strain card in the list**

Pass an `isHardest` prop to `WorkoutCard` (`w.id === hardest?.id`) and, when true, add a subtle accent border (e.g. `borderColor: 'rgba(249,115,22,0.5)'`) so the hardest session stands out in the chronological list. Keep the list chronological — don't resort.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9` (baseline; no new errors in `WhoopDashboard.tsx`).

---

### Task 4: Apply the migration ⚠️ PRODUCTION

- [ ] **Step 1: Narrate + apply**

Use `mcp__claude_ai_Supabase__apply_migration` (`project_id: mrntwydykqsdawpklumf`, `name: whoop_activities`, full SQL from Task 1).

- [ ] **Step 2: Verify**

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name='whoop_activities';
select relrowsecurity from pg_class where relname='whoop_activities';
```
Expected: table present, `relrowsecurity = true`.

---

### Task 5: Deploy the function ⚠️ PRODUCTION

- [ ] **Step 1: Deploy**

Use `mcp__claude_ai_Supabase__deploy_edge_function` with the full updated `index.ts` (`name: training-recommendation`, `verify_jwt: false`, `entrypoint_path: index.ts`). This becomes version 3.

- [ ] **Step 2: Confirm ACTIVE**

`mcp__claude_ai_Supabase__list_edge_functions` → `training-recommendation` version 3, `ACTIVE`.

---

### Task 6: Verify sync end-to-end

- [ ] **Step 1: Trigger a forced regenerate**

In the running app (signed in as the test user), tap the ↻ refresh on the Train Today card (sends `force` + `force_whoop`), so the function re-fetches WHOOP and runs `syncWhoopActivities`.

- [ ] **Step 2: Confirm rows written**

```sql
select count(*) as n, max(strain) as top_strain, min(date) as oldest, max(date) as newest
from whoop_activities
where user_id = 'f91e83fe-f010-429c-9c13-05377f6c57b9';
```
Expected: `n >= 1`, a plausible `top_strain`, dates within the last ~28 days. (Day-tab history is ~10–25 activities depending on WHOOP's return.)

- [ ] **Step 3: Confirm the card surfaces the hardest activity**

On Home, expand the WHOOP card's Workouts section: the "Hardest recently" line shows the max-strain sport + value, and that activity's card carries the accent border.

---

### Task 7: Commit + push

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260814000000_whoop_activities.sql \
        supabase/functions/training-recommendation/index.ts \
        src/features/whoop/components/WhoopDashboard.tsx
git commit -m "feat(whoop): sync activities to whoop_activities + surface hardest strain

Daily recommendation job now upserts each WHOOP activity (sport, strain,
HR, energy, distance, zones) into whoop_activities — persistent history
so the app shows activities without reopening WHOOP, and the training
data the personalized strain-cost model (Slice 2) will learn from. WHOOP
card gains a 'hardest recently' summary + accent on the top-strain
session.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

---

## Definition of Done (Slice 1)

- `whoop_activities` exists with RLS; the daily job upserts activities on every generation (verified: rows for the test user).
- The WHOOP card shows the hardest recent activity + highlights it.
- `npm run build` passes at the 9-error tsc baseline; committed + pushed.
- Sets up Slice 2 (strain-cost model), which reads `whoop_activities` joined to logged workouts by date.
