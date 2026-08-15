# Slice 3 — Personalized Recovery Dose-Response Model — Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps.

**Goal:** Learn how *this user's* next-morning recovery responds to yesterday's strain and last night's sleep — "a hard day (strain ~15) tends to leave you around X% recovery; each +1 strain ≈ −Y% for you." Second of the three personalized-v2 models. Surfaced in the AI coach ("how does rest/load affect me").

**Approach:** Same tiny ridge + population-prior blend as the strain-cost model, reusing `solveLinear`, `user_training_models`, and the fit/blend pattern. Features per day `x=[1, strain_prev, sleep]`; target `y = recovery`. Pairs: for each recovery reading on date X, `strain_prev = cycle strain on X-1`, `sleep = sleep performance on X`.

**Population prior:** `intercept 55, perStrain −1.0, perSleep 0.25` (strain 15 + sleep 80 ⇒ ~60% recovery).

**Prod:** user pre-authorized ("its yes") — deploy without prompting.

---

### Task 1: Migration — snapshot recovery column
- Create `supabase/migrations/20260814040000_snapshot_recovery_insight.sql`:
```sql
alter table public.athlete_daily_snapshots
  add column if not exists recovery_insight jsonb;
notify pgrst, 'reload schema';
```

### Task 2: Edge function — model + pairs + fit + insight
`supabase/functions/training-recommendation/index.ts`:
- `RecoveryCoef = {intercept, perStrain, perSleep}`, `RECOVERY_PRIOR`, `RecoveryPair`.
- `fitRecoveryResponse(pairs)` — ridge over `[1, strain, sleep]` (regularize slopes), blend `w=n/(n+6)`, r2/mae, reuse `solveLinear`.
- `buildRecoveryPairs(recovery, cycles, sleep)` — pure (all already fetched): index cycle strain by date and sleep perf by date; for each recovery{date X, score}, take `strain(X-1)` + `sleep(X)`; keep when both present.
- In `generateRecommendation`: fit, upsert `user_training_models` `recovery_response`, derive `recoveryInsight` = predicted recovery after a hard day (strain 15, the user's median sleep) + the learned per-strain sensitivity + a verdict on whether strain or sleep drives their recovery more. Add `recovery_insight` to the snapshot.

### Task 3: Coach surfacing
`src/lib/aiCoach.ts`:
- `RecoveryContext` type + `buildRecoveryResponseSection(ctx)` — "RECOVERY RESPONSE (learned)" block: per-strain sensitivity, predicted recovery after a hard day, dominant driver; confidence-gated (blend < 0.4 ⇒ "still learning").
- Add `recovery: RecoveryContext | null = null` param to `buildSystemPrompt`; include the section; extend the readiness/strain rule to use it for "how does load/rest affect my recovery".

`src/features/recommendations/services/trainingRecommendation.ts`:
- `getRecoveryContext()` — reads `user_training_models` `recovery_response` + latest snapshot `recovery_insight` (RLS-scoped), mirrors `getStrainCostContext`.

`src/components/ai/AiChat.tsx`:
- Load `getRecoveryContext()` alongside strain; state `recovery`; pass to `buildSystemPrompt`; add to the send deps.

### Task 4: Deploy + verify
- Apply migration; deploy function (CLI); after a forced regenerate, verify `user_training_models` has a `recovery_response` row + snapshot `recovery_insight`.

### Task 5: Build + commit + push
- `npm run build`; commit `feat(coach): personalized recovery dose-response model (slice 3)`.

## Done when
- `recovery_response` model refits daily; coach can explain how the user's recovery responds to strain + sleep, honestly confidence-gated. Baseline tsc (9); committed.
