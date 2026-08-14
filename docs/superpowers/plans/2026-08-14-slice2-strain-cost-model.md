# Slice 2 — Personalized Strain-Cost Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Learn, per user, how much WHOOP strain a training session costs given the volume logged — "for *you*, this session ≈ 12 strain" — and surface "your last session cost X strain, ~Y% above/below your usual" in the coach and Home. First of the three `personalized-v2` models.

**Approach:** A tiny ridge regression (intercept + 2 features: total sets, total volume) fit per user each day in the `training-recommendation` edge function, blended with a population prior so it degrades gracefully on thin data. Coefficients + fit quality stored in a new `user_training_models` table. The model is interpretable (you can read the learned numbers) and cheap to refit nightly.

**Math (ridge, closed form):** minimize ‖Xb − y‖² + λ‖b₁…‖² (intercept unregularized). Solve the 3×3 normal equations `(XᵀX + λR)b = Xᵀy` with Gaussian elimination. Blend with prior: `effective = w·fitted + (1−w)·prior`, `w = n/(n+K)`, `K=6`. Fit only when `n ≥ 3`, else pure prior.

**Features / target per training day:** `x = [1, totalSets, totalVolume/1000]`; `y = strain of that day's weight-training WHOOP activity` (sport ∈ {Weight Training, CrossFit, HIIT, Functional Fitness}); fall back to the day's cycle strain when no lifting activity exists (flagged `from_cycle`). Pairs drawn from the last 90 days where a logged workout and a strain value both exist.

**Population prior (hand-set, sane defaults):** `intercept 4.0, perSet 0.30, perVolK 0.5` — a moderate session (~15 sets, ~6k volume) ≈ 4 + 4.5 + 3 ≈ 11.5 strain.

**Tech stack:** Supabase (Postgres + RLS + Deno edge fn), TS. Prod steps gated (user pre-authorized).

**Test user:** `f91e83fe-f010-429c-9c13-05377f6c57b9`.

---

### Task 1: Migration — `user_training_models`

**Files:** Create `supabase/migrations/20260814010000_user_training_models.sql`

- [ ] **Step 1: Write**

```sql
-- Per-user learned model parameters (personalized-v2). One row per model per
-- user; refit daily by the training-recommendation edge function.
create table if not exists public.user_training_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,                       -- 'strain_cost' | (later) 'recovery_response' | 'preference'
  model_version text not null default 'personalized-v2',
  coefficients jsonb not null default '{}'::jsonb, -- learned params (e.g. {intercept, perSet, perVolK})
  n_samples integer not null default 0,
  quality jsonb not null default '{}'::jsonb,       -- {r2, mae, blendWeight, fromCyclePairs}
  updated_at timestamptz not null default now(),
  unique (user_id, model_name)
);

alter table public.user_training_models enable row level security;

create policy "user_training_models_select_own"
on public.user_training_models for select
using (auth.uid() = user_id);

create index if not exists user_training_models_user_idx
  on public.user_training_models (user_id, model_name);
```

- [ ] **Step 2:** Confirm additive/idempotent (create-if-not-exists, RLS, owner-select, index).

---

### Task 2: Strain-cost math (pure, verifiable)

**Files:** Modify `supabase/functions/training-recommendation/index.ts`

Add a self-contained block (no Deno/Supabase deps) so it can be reasoned about and sanity-checked with a Node script.

- [ ] **Step 1: Matrix solve + ridge fit + predict**

```ts
// ── Strain-cost model (personalized-v2) ─────────────────────────────
type StrainCostCoef = { intercept: number; perSet: number; perVolK: number };
const STRAIN_COST_PRIOR: StrainCostCoef = { intercept: 4.0, perSet: 0.30, perVolK: 0.5 };
const PRIOR_WEIGHT_K = 6;
const RIDGE_LAMBDA = 1.0;

type StrainPair = { sets: number; volK: number; strain: number; fromCycle: boolean };

// Solve A x = b for small square A via Gaussian elimination with partial pivot.
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function fitStrainCost(pairs: StrainPair[]): { coef: StrainCostCoef; n: number; r2: number; mae: number; blendWeight: number; fromCyclePairs: number } {
  const n = pairs.length;
  const fromCyclePairs = pairs.filter((p) => p.fromCycle).length;
  let fitted = { ...STRAIN_COST_PRIOR };
  let r2 = 0; let mae = 0;
  if (n >= 3) {
    // Design rows [1, sets, volK]; ridge normal equations (intercept unregularized).
    const X = pairs.map((p) => [1, p.sets, p.volK]);
    const y = pairs.map((p) => p.strain);
    const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Xty = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        Xty[a] += X[i][a] * y[i];
        for (let bb = 0; bb < 3; bb++) XtX[a][bb] += X[i][a] * X[i][bb];
      }
    }
    XtX[1][1] += RIDGE_LAMBDA; XtX[2][2] += RIDGE_LAMBDA; // regularize slopes only
    const sol = solveLinear(XtX, Xty);
    if (sol) {
      fitted = { intercept: sol[0], perSet: sol[1], perVolK: sol[2] };
      const preds = X.map((r) => r[0] * fitted.intercept + r[1] * fitted.perSet + r[2] * fitted.perVolK);
      const my = y.reduce((s, v) => s + v, 0) / n;
      let ssRes = 0, ssTot = 0, absErr = 0;
      for (let i = 0; i < n; i++) { ssRes += (y[i] - preds[i]) ** 2; ssTot += (y[i] - my) ** 2; absErr += Math.abs(y[i] - preds[i]); }
      r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
      mae = absErr / n;
    }
  }
  const w = n / (n + PRIOR_WEIGHT_K); // 0 → all prior, 1 → all fitted
  const coef: StrainCostCoef = {
    intercept: w * fitted.intercept + (1 - w) * STRAIN_COST_PRIOR.intercept,
    perSet: w * fitted.perSet + (1 - w) * STRAIN_COST_PRIOR.perSet,
    perVolK: w * fitted.perVolK + (1 - w) * STRAIN_COST_PRIOR.perVolK,
  };
  return { coef, n, r2, mae, blendWeight: w, fromCyclePairs };
}

function predictStrain(coef: StrainCostCoef, sets: number, volK: number): number {
  return Math.max(0, coef.intercept + coef.perSet * sets + coef.perVolK * volK);
}
```

- [ ] **Step 2: Sanity-check the solver with a Node script** (throwaway, not committed)

Write `/tmp/ridgecheck.mjs` reproducing `solveLinear` + `fitStrainCost` on synthetic pairs generated from known coefficients (e.g. `strain = 3 + 0.4*sets + 0.7*volK + noise`) and confirm the fitted (high-n) coefficients recover them within ~15% and `r2 > 0.8`. Run `node /tmp/ridgecheck.mjs`. Expected: recovered ≈ true, high R². Delete after.

---

### Task 3: Build pairs, fit, store, and derive the "last session cost" insight

**Files:** Modify `supabase/functions/training-recommendation/index.ts`

- [ ] **Step 1: Gym-day feature aggregation**

Add a helper that reduces a `GymWorkout` to `{ date, sets, volK }`:

```ts
function gymDayFeatures(w: GymWorkout): { date: string; sets: number; volK: number } {
  let sets = 0, vol = 0;
  for (const ex of w.exercises ?? []) {
    const s = Math.max(0, Number(ex.sets) || 0);
    const reps = Math.max(0, Number(ex.reps) || 0);
    const weight = Math.max(0, Number(ex.weight) || 0);
    sets += s;
    vol += (ex.unit === 'kg' || ex.unit === 'lbs') ? s * reps * weight : 0;
  }
  return { date: w.date, sets, volK: vol / 1000 };
}
```

- [ ] **Step 2: Pair builder (uses persisted `whoop_activities` + cycle fallback)**

```ts
const LIFT_SPORTS = new Set(['Weight Training', 'CrossFit', 'HIIT', 'Functional Fitness']);

async function buildStrainPairs(sb: any, userId: string, gym: GymWorkout[], cycles: ParsedCycle[]): Promise<StrainPair[]> {
  const since = addDays(todayKey(), -89);
  const { data: acts } = await sb
    .from('whoop_activities')
    .select('date, sport_name, strain')
    .eq('user_id', userId)
    .gte('date', since);
  const liftByDate = new Map<string, number>(); // best lifting-activity strain per date
  for (const a of (acts ?? []) as any[]) {
    if (a.strain == null || !LIFT_SPORTS.has(a.sport_name)) continue;
    liftByDate.set(a.date, Math.max(liftByDate.get(a.date) ?? -1, Number(a.strain)));
  }
  const cycleByDate = new Map(cycles.filter((c) => c.strain_score != null).map((c) => [c.date, c.strain_score as number]));

  const pairs: StrainPair[] = [];
  for (const w of gym) {
    const f = gymDayFeatures(w);
    if (f.sets <= 0) continue;
    const lift = liftByDate.get(f.date);
    const strain = lift ?? cycleByDate.get(f.date);
    if (strain == null) continue;
    pairs.push({ sets: f.sets, volK: f.volK, strain, fromCycle: lift == null });
  }
  return pairs;
}
```

- [ ] **Step 3: Fit + upsert into `user_training_models`, and derive the last-session insight**

In `generateRecommendation`, after `muscleState`/`load`/`readiness` are computed:

```ts
const strainPairs = await buildStrainPairs(sb, userId, gym, whoop.cycles).catch(() => [] as StrainPair[]);
const strainModel = fitStrainCost(strainPairs);
await sb.from('user_training_models').upsert({
  user_id: userId, model_name: 'strain_cost', model_version: 'personalized-v2',
  coefficients: strainModel.coef, n_samples: strainModel.n,
  quality: { r2: strainModel.r2, mae: strainModel.mae, blendWeight: strainModel.blendWeight, fromCyclePairs: strainModel.fromCyclePairs },
  updated_at: new Date().toISOString(),
}, { onConflict: 'user_id,model_name' }).then(({ error }: any) => { if (error) console.error('strain model upsert failed:', error.message); });

// Last-session cost insight: newest gym day that has a matched strain.
let strainInsight: Record<string, unknown> | null = null;
const sortedPairs = [...gym].sort((a, b) => b.date.localeCompare(a.date));
for (const w of sortedPairs) {
  const f = gymDayFeatures(w);
  if (f.sets <= 0) continue;
  const pair = strainPairs.find((p) => Math.abs(p.sets - f.sets) < 0.5 && Math.abs(p.volK - f.volK) < 0.01);
  if (!pair) continue;
  const expected = predictStrain(strainModel.coef, f.sets, f.volK);
  const ratio = expected > 0 ? pair.strain / expected : 1;
  strainInsight = {
    date: w.date, title: w.title, actual_strain: Number(pair.strain.toFixed(1)),
    expected_strain: Number(expected.toFixed(1)),
    delta_pct: Math.round((ratio - 1) * 100),
    verdict: ratio > 1.15 ? 'higher than usual' : ratio < 0.85 ? 'lighter than usual' : 'about as expected',
    from_cycle: pair.fromCycle, blend_weight: Number(strainModel.blendWeight.toFixed(2)),
  };
  break;
}
```

- [ ] **Step 4: Persist the model summary + insight on the snapshot and return in payload**

Add to `snapshot`: `strain_cost: { coef: strainModel.coef, n: strainModel.n, r2: strainModel.r2, blend: strainModel.blendWeight }` and `strain_insight: strainInsight`. Add `strain_insight: strainInsight` to the object returned to the client.

- [ ] **Step 5: Deno sanity** — keep types clean; the file already deploys via esbuild.

---

### Task 4: Surface in the AI coach

**Files:** Modify `src/lib/aiCoach.ts`

- [ ] **Step 1: Read the model + latest insight and add a section**

The coach builds its prompt from data passed in. Add a `buildStrainCostSection(model, insight)` that renders (only when data exists):

```
━━ STRAIN COST (learned) ━━
  Your model: ~{intercept}+{perSet}/set+{perVolK}/1k-volume strain (n={n}, {blend}% yours).
  Last session — {title} ({date}): {actual} strain vs ~{expected} expected → {verdict} ({+/-delta}%).
  (Use this to judge whether a session over/under-cost for its volume; high delta = they pushed hard or under-recovered. Cite only if present; say so honestly when the model is still mostly population-prior.)
```

Where the coach fetches WHOOP/snapshot data, also fetch the latest `training_recommendations`/`athlete_daily_snapshots` `strain_insight` + `user_training_models` row for the user (or thread them through from the caller that already loads coach context). Add a STRAIN-COST coaching rule mirroring the earlier WHOOP rules: quote real numbers only, flag low-confidence when `blend < ~0.4`.

- [ ] **Step 2: Typecheck** — `npx tsc -p src/tsconfig.json --noEmit` stays at 9 baseline.

---

### Task 5: Surface on Home (recommendation card)

**Files:** Modify `src/features/recommendations/services/trainingRecommendation.ts`, `src/components/home/TrainingRecommendationCard.tsx`

- [ ] **Step 1: Extend the client type + response**

Add `strain_insight?: { title: string; date: string; actual_strain: number; expected_strain: number; delta_pct: number; verdict: string; blend_weight: number } | null` to `TrainingRecommendation`/response parsing (it rides on the same edge response).

- [ ] **Step 2: Render a compact line in the card**

When `strain_insight` exists and `blend_weight >= 0.4`, add under the reasons:

```tsx
<p className="text-[9.5px] leading-[1.35]" style={{ color: 'var(--text-secondary)' }}>
  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Last session: </span>
  {strainInsight.actual_strain} strain vs ~{strainInsight.expected_strain} expected · {strainInsight.verdict}
</p>
```

- [ ] **Step 3: Typecheck** — baseline 9.

---

### Task 6: Deploy + verify ⚠️ PRODUCTION

- [ ] **Step 1:** Apply migration (`user_training_models`); verify table + RLS.
- [ ] **Step 2:** Deploy the edge function (version 4); confirm ACTIVE.
- [ ] **Step 3:** In-app, sign in as the test user and tap ↻ on the Train Today card (force → regenerates → syncs activities → fits model). This also verifies Slice 1's sync.
- [ ] **Step 4:** Verify in DB:
```sql
select model_name, n_samples, coefficients, quality from user_training_models
where user_id = 'f91e83fe-f010-429c-9c13-05377f6c57b9';
select whoop->>'activities_synced' as synced, readiness->>'tier' as tier,
       (readiness is not null) as ok from athlete_daily_snapshots
where user_id = 'f91e83fe-f010-429c-9c13-05377f6c57b9' order by date desc limit 1;
```
Expected: a `strain_cost` row with 3 coefficients, `n_samples ≥ 0`, `blendWeight` in [0,1]; `activities_synced > 0` once lifting activities exist.

---

### Task 7: Build + commit + push

- [ ] `npm run build` passes.
- [ ] Commit migration + function + `aiCoach.ts` + card + service with a `feat(coach): personalized strain-cost model (personalized-v2)` message; push.

---

## Definition of Done (Slice 2)

- `user_training_models` holds a daily-refit `strain_cost` row for the user.
- The coach and Home card can state "last session cost X vs ~Y expected" using the user's own learned model, blended honestly with the population prior and confidence-gated.
- Build passes at the 9-error tsc baseline; committed + pushed.
- Sets up Slice 3 (recovery dose-response) which reuses `user_training_models` + the same fit/blend pattern.
