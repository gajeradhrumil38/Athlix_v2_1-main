# Slice 0 — Ship the Training-Recommendation Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing (uncommitted, undeployed, unapplied) `deterministic-v1` training-recommendation engine fully live and committed, so the Home `TrainingRecommendationCard` renders a real daily plan and the later ML slices have data + infra to build on.

**Architecture:** A Supabase Deno edge function (`training-recommendation`) pulls WHOOP + gym data, writes `athlete_daily_snapshots` + `training_recommendations`, and serves them to a React card on Home. This slice deploys and commits that existing code unchanged (bug-fixes only if verification finds them) — no new features.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), React 18 + TypeScript (Vite SPA), Supabase MCP tools for migration apply + function deploy.

**Production safety:** Tasks 3 and 4 mutate the live Supabase project (schema + deployed function). The executor MUST get explicit user confirmation immediately before each of those two tasks. All other tasks are local.

**Test user with data:** `f91e83fe-f010-429c-9c13-05377f6c57b9` (WHOOP connected, 25-day history).

---

### Task 1: Pre-flight review of the untracked engine

**Files (read-only this task):**
- `supabase/migrations/20260813202257_training_recommendation_v1.sql`
- `supabase/functions/training-recommendation/index.ts`
- `src/features/recommendations/services/trainingRecommendation.ts`
- `src/components/home/TrainingRecommendationCard.tsx`
- `src/pages/Home.tsx:626` (render site)

- [ ] **Step 1: Confirm the client compiles at the known baseline**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `9` (the pre-existing baseline; none in the recommendation files). If any error is inside `trainingRecommendation.ts` or `TrainingRecommendationCard.tsx`, fix it minimally before proceeding.

- [ ] **Step 2: Lint the edge function for obvious deploy blockers**

Read `supabase/functions/training-recommendation/index.ts` and confirm: it reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` from `Deno.env`; the `today`/`feedback` actions and upserts key on `(user_id,date)`; no syntax errors. Note (do not fix unless broken) that it mirrors the parsing in `src/features/whoop/services/whoopService.ts`.

- [ ] **Step 3: Confirm the migration is self-contained and idempotent**

Verify every `create table` uses `if not exists`, RLS is enabled on all three tables, and policies/indexes are present. No changes expected — this is a read/confirm step.

- [ ] **Step 4: Record findings**

If Steps 1–3 found zero blockers, note "baseline verified, no code changes". If any fix was required, keep it minimal and list it. Do not add features in this slice.

---

### Task 2: Verify WHOOP secrets exist for the function

**Files:** none (Supabase project config).

- [ ] **Step 1: Confirm the WHOOP OAuth secrets are already set**

The already-deployed `whoop-oauth` function uses `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET`, so they should exist as project secrets. Confirm with the user that the `training-recommendation` function will inherit the same project secrets (Supabase edge secrets are project-wide). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
Expected: user confirms secrets are present. If not, they set them before Task 3.

---

### Task 3: Apply the migration to the live database ⚠️ PRODUCTION

**Files:**
- Apply: `supabase/migrations/20260813202257_training_recommendation_v1.sql`

- [ ] **Step 1: Get explicit user confirmation**

Ask: "Apply migration `20260813202257_training_recommendation_v1` to the live AthlixV2 database? It creates 3 new tables (`athlete_daily_snapshots`, `training_recommendations`, `recommendation_feedback`) with RLS. Additive only — no existing tables touched." Wait for a clear yes.

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: mrntwydykqsdawpklumf`, `name: training_recommendation_v1`, and the full SQL file contents.
Expected: success, no error.

- [ ] **Step 3: Verify the tables exist**

Use `mcp__claude_ai_Supabase__execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('athlete_daily_snapshots','training_recommendations','recommendation_feedback')
order by table_name;
```
Expected: all three rows returned.

- [ ] **Step 4: Verify RLS is on**

```sql
select relname, relrowsecurity from pg_class
where relname in ('athlete_daily_snapshots','training_recommendations','recommendation_feedback');
```
Expected: `relrowsecurity = true` for all three.

---

### Task 4: Deploy the edge function ⚠️ PRODUCTION

**Files:**
- Deploy: `supabase/functions/training-recommendation/index.ts`

- [ ] **Step 1: Get explicit user confirmation**

Ask: "Deploy the new `training-recommendation` edge function to the live project? It's a new function — it does not replace `whoop-oauth`/`whoop-auth`." Wait for a clear yes.

- [ ] **Step 2: Deploy via Supabase MCP**

Use `mcp__claude_ai_Supabase__deploy_edge_function` with `project_id: mrntwydykqsdawpklumf`, `name: training-recommendation`, and the function file. Keep `verify_jwt` at its default (the function verifies the JWT itself via `sb.auth.getUser`).
Expected: success; function appears `ACTIVE`.

- [ ] **Step 3: Confirm it is listed**

Use `mcp__claude_ai_Supabase__list_edge_functions` (`project_id: mrntwydykqsdawpklumf`).
Expected: `training-recommendation` present with status `ACTIVE`.

---

### Task 5: Smoke-test generation for the test user

**Files:** none (runtime verification).

- [ ] **Step 1: Confirm no snapshot exists yet for today**

```sql
select count(*) from athlete_daily_snapshots
where user_id = 'f91e83fe-f010-429c-9c13-05377f6c57b9';
```
Expected: `0` (fresh tables).

- [ ] **Step 2: Trigger generation through the real client path**

The function requires a valid user JWT, so trigger it from the app rather than a raw curl: run the app locally (`npm run dev`), sign in as the test user, open Home, and let `TrainingRecommendationCard` call `getTodayTrainingRecommendation(false)`. (If a service-role invocation harness is available, invoking with `{ action: 'today' }` for that user id is an acceptable alternative.)
Expected: the card leaves its "Backend plan will appear…" empty state and shows a real plan.

- [ ] **Step 3: Verify rows were written**

```sql
select date, recommendation_type, intensity, readiness_tier, score, confidence, model_version
from training_recommendations
where user_id = 'f91e83fe-f010-429c-9c13-05377f6c57b9'
order by date desc limit 1;
```
Expected: one row, `model_version = 'deterministic-v1'`, a plausible `recommendation_type` and `confidence` in [0,1]. Also confirm one `athlete_daily_snapshots` row for the same date with non-empty `readiness` / `training_load` / `muscle_state` jsonb.

---

### Task 6: Verify the Home card states in the running app

**Files:**
- `src/components/home/TrainingRecommendationCard.tsx` (behavior under test)

- [ ] **Step 1: Full state**

With the test user (has data), confirm the card shows: title, intensity + readiness-tier chips, up to 4 muscle chips, up to 2 reasons, up to 3 exercises, and the "N% confidence · explainable V1" footer. Tapping the body navigates to `/log` with `preselectedMuscles`.
Expected: all present; tap navigates and fires an `accepted` feedback call (verify a `recommendation_feedback` row appears).

- [ ] **Step 2: No-data / no-WHOOP degradation**

Reason through (or test with a fresh account if available) that a user with no workouts and no WHOOP still gets a non-crashing card: the function returns a `rest`/`mobility`-leaning recommendation at low confidence, or the card shows its "Try Again" empty state on error. Confirm no unhandled exception in the console.
Expected: graceful; never a blank/crashed widget.

- [ ] **Step 3: Refresh + feedback**

Click the refresh icon → `load(true)` → function regenerates (`force`), row upserts on `(user_id,date)` (no duplicate-key error).
Expected: card refreshes cleanly; still exactly one row per (user, date).

---

### Task 7: Commit the baseline

**Files:**
- `supabase/migrations/20260813202257_training_recommendation_v1.sql`
- `supabase/functions/training-recommendation/index.ts`
- `src/features/recommendations/services/trainingRecommendation.ts`
- `src/components/home/TrainingRecommendationCard.tsx`
- `src/pages/Home.tsx` (only if it has an uncommitted change wiring the card)

- [ ] **Step 1: Confirm production build passes**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 2: Stage and commit**

```bash
git add supabase/migrations/20260813202257_training_recommendation_v1.sql \
        supabase/functions/training-recommendation/index.ts \
        src/features/recommendations/services/trainingRecommendation.ts \
        src/components/home/TrainingRecommendationCard.tsx
# include Home.tsx ONLY if `git status` shows the card-wiring change is uncommitted
git commit -m "feat(coach): ship deterministic-v1 training recommendation engine

Daily WHOOP+gym → readiness/load/muscle-state snapshot → explainable
push/pull/legs recommendation on Home. Migration applied + edge function
deployed. Baseline for the personalized-v2 ML slices.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: pushed; user's deploy pipeline picks up the client card.

---

## Definition of Done (Slice 0)

- The three tables exist with RLS in the live DB.
- `training-recommendation` is deployed and `ACTIVE`.
- The test user gets a real recommendation on Home (verified in DB + UI).
- No-data path degrades gracefully.
- All four untracked files are committed and pushed; `npm run build` passes.
- No new features added — this slice only makes the existing engine live. The
  ML models (strain-cost, recovery dose-response, feedback personalization) and
  WHOOP activity sync are Slices 1–4, each with its own plan.
