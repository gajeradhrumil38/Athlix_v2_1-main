# Personalized Daily Training Intelligence — Design

**Date:** 2026-08-14
**Status:** Approved (design), pending implementation-plan
**Model lineage:** `deterministic-v1` (exists, unshipped) → `personalized-v2` (this spec)

## Goal

A daily system that learns *this user's* strain-cost and recovery-response from
their WHOOP + gym data, tells them what to train and why, and surfaces WHOOP
activity strain in-app so they never need to reopen the WHOOP app. Its outputs
feed both the Home `TrainingRecommendationCard` and the AI coach.

## Why this shape (data reality)

A single user with a few weeks of WHOOP + gym history is far too little to train
a general ML model (neural net / GBM) for "what should I train" — it would
overfit noise and give worse advice than the existing rules engine. Instead we
add **three small, interpretable, per-user models** that fit parameters to the
user's data, retrain daily, degrade gracefully when data is thin (population
prior → blend in user data as it grows), and are fully explainable. The existing
`recommendation_feedback` table keeps collecting labels so a heavier model
becomes viable later; `model_version` lets us evolve without breaking history.

All model math is implemented in TypeScript inside the existing Deno edge
function (ridge regression via normal equations / small gradient descent for a
handful of features). No Python, no external ML service.

## Current state (verified)

- `supabase/functions/training-recommendation/index.ts` — full deterministic
  engine (readiness, ACWR/load, muscle-state, candidate scoring, intensity,
  exercises, reasons, confidence, feedback endpoint). **Uncommitted.**
- `supabase/migrations/20260813202257_training_recommendation_v1.sql` — creates
  `athlete_daily_snapshots`, `training_recommendations`,
  `recommendation_feedback` (+ RLS, indexes). **Not applied to the DB.**
- `src/features/recommendations/services/trainingRecommendation.ts` — client
  wrapper (`getTodayTrainingRecommendation`, `sendRecommendationFeedback`).
  **Uncommitted.**
- `src/components/home/TrainingRecommendationCard.tsx` — rendered on Home
  (`Home.tsx:626`). **Uncommitted; currently non-functional** (tables/function
  not live).
- AI coach already has WHOOP readiness + per-activity strain
  (`buildWhoopSection`, `buildWhoopActivitySection` in `src/lib/aiCoach.ts`).

## Architecture

```
nightly pg_cron (per recently-active user)
        │  (lazy fallback: first Home open of the day if cron missed)
        ▼
training-recommendation edge function  ── re-pull WHOOP (recovery/sleep/cycles/activities)
        │                               ── sync activities → whoop_activities
        │                               ── refit 3 per-user models → user_training_models
        │                               ── regenerate snapshot + recommendation
        ▼
Postgres: athlete_daily_snapshots, training_recommendations,
          whoop_activities, user_training_models, recommendation_feedback
        ▼
Home TrainingRecommendationCard + WHOOP card + AI coach system prompt
```

## Slices (each independently shippable + testable)

### Slice 0 — Ship the baseline *(hard prerequisite)*
Make the existing engine live so the models have data to train on.
- Apply `20260813202257_training_recommendation_v1.sql` to the DB.
- Deploy the `training-recommendation` edge function; set its secrets
  (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, service role).
- Commit the untracked engine + client service + Home card.
- Verify the Home card renders a real recommendation for a user with data, and
  degrades cleanly for a user with none / no WHOOP.
- No behavior change beyond making the existing design functional.

### Slice 1 — WHOOP activity sync + card
- New table `whoop_activities` (user_id, whoop_id, date, sport_id, sport_name,
  start, end, strain, avg_hr, max_hr, kilojoules, distance_meter, zones jsonb;
  unique(user_id, whoop_id); RLS owner-select). Populated by the daily job so
  activities persist in the user's own DB — no reopening the WHOOP app.
- Extend the WHOOP card with a compact activity list: per session sport + strain
  (+ HR/kcal/distance where present), sorted by strain, "which cost the most."
- Visual twin of the coach's existing `buildWhoopActivitySection`.

### Slice 2 — Strain-cost model *(headline insight)*
- Per-user **ridge regression**: features = logged volume per muscle group /
  movement pattern + session type (push/pull/legs/…); target = that day's WHOOP
  activity strain (weight-training activity, matched by date).
- Cold-start: population prior (fixed coefficients) until ~8 matched sessions;
  ridge shrinkage blends user data in as N grows. Report `n_samples` +
  `r2`-style fit quality.
- Output (Home card + coach): "your weightlifting cost 14.2 strain — ~20% above
  your usual for that volume; consider easing the next session."

### Slice 3 — Recovery dose-response model
- Per-user regression: features = yesterday's strain/load + sleep performance +
  HRV; target = next-day recovery score (and/or next-day HRV). Learns "this much
  load tends to drop your recovery ~12%."
- Output: recovery-effect explanation in card + coach ("how does rest affect
  this"); feeds the readiness/intensity decision.

### Slice 4 — Feedback personalization
- Online update from `recommendation_feedback` (accepted / modified / skipped /
  completed): a per-user logistic/bandit weighting layered on the deterministic
  candidate scores, nudging recommendations toward what the user actually does
  and completes. This is the part that "retrains on behavior daily."

## Cross-cutting

- **`user_training_models` table:** one row per (user, model_name, model_version)
  holding learned coefficients (jsonb), sample counts, fit quality, updated_at.
  RLS owner-select; written by the edge function (service role).
- **Daily mechanism:** pg_cron job (early morning, user's tz where feasible)
  enumerates recently-active users and invokes the edge function per user;
  lazy fallback path regenerates on the first Home open if the day's row is
  missing. Idempotent upserts keyed on (user_id, date).
- **Coach integration:** the three models' plain-English outputs are appended to
  the coach system prompt (extends the existing WHOOP sections), so chat can
  explain strain-cost and recovery-response using the user's own numbers.
- **Honest confidence:** every model reports how much of its output is the user's
  data vs. the population prior; surfaced through the confidence chip the card
  already has. Never present a population-prior number as if it were personal.

## Error handling & degradation

- WHOOP not connected → engine still runs on gym data; models sit at population
  prior; card shows readiness "unknown" and load-only advice (existing behavior).
- WHOOP fetch fails in the job → reuse last cached snapshot; never blank the card.
- Thin data → models return prior + low confidence, never a fabricated personal
  stat. Matches the app's existing "no faked readiness" rule.

## Testing approach

- Pure model math (strain-cost fit, dose-response fit, personalization update) is
  extracted into testable TS modules with unit tests over synthetic fixtures
  (known coefficients recovered within tolerance; cold-start returns prior;
  thin-N returns low confidence).
- Edge-function integration: snapshot/recommendation upsert idempotency; activity
  sync dedupe on (user_id, whoop_id).
- Client: card renders each state (loading / no-data / no-WHOOP / full); WHOOP
  card activity list renders empty + populated.

## Out of scope (future)

- A heavier learned model (GBM/neural) trained across the feedback corpus — the
  tables and `model_version` are designed to allow it once data supports it.
- Morning push notifications off the nightly job (enabled by the cron, not built
  here).
- Cross-user population priors learned from aggregate data (start with
  hand-set priors).
