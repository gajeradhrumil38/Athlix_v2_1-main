# Trainer ↔ Trainee Coaching — Design

**Status:** Approved design → ready for implementation plan
**Date:** 2026-08-19

## Goal

Let a **trainer** coach real Athlix users: invite a trainee by email, and once
the trainee accepts, view that trainee's training / recovery / sleep data (only
the categories the trainee chooses to share) on a rich dashboard, and assign
workout plans the trainee can see and start. First cross-user data access in the
app — so the security model is load-bearing.

## Approved decisions

| Decision | Choice |
|----------|--------|
| Linking | **Trainer invites by email → trainee accepts/declines** in Settings |
| Trainer role | **Dedicated flag** (`profiles.is_trainer`), admin-granted for v1 |
| Data sharing | **Per-category**, trainee-controlled, off by default until toggled on |
| Access mechanism | **RLS-direct** — scope-gated Row Level Security, no new API surface |

### Core flow (as clarified by the user)
- **Trainer dashboard:** one input — trainee's **email** → **Send invite**.
- **Trainee (Settings → Coaches):** sees "**\<Trainer\> invited you to coach you**"
  with **Accept** / **Decline**. On Accept, a scope sheet lets them choose which
  categories to share. They can change scopes or **Disconnect** any time.

## Architecture

### Access approach — RLS-direct (chosen)
The trainer reads trainee rows with the normal Supabase browser client; new
**additive** RLS policies decide visibility. RLS policies are OR-ed, so the
existing "own rows only" policies are completely untouched — a trainer simply
gains an *additional* path to SELECT specific trainee rows. Flipping a scope off
or disconnecting makes the rows disappear on the very next query. The trainer
never receives write access to trainee data.

Rejected: edge-function-mediated (whole API surface to build/maintain for no
security gain over RLS) and data-copy/snapshot (stale + a privacy liability).

## Data model (new migration)

```sql
-- profiles: dedicated trainer role + public-facing trainer identity
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_trainer            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trainer_display_name  text,
  ADD COLUMN IF NOT EXISTS trainer_bio           text;

-- The relationship + per-category consent
CREATE TABLE public.coach_links (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainee_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- null until accepted
  invited_email text NOT NULL,                                       -- lowercased
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','revoked')),
  shared_scopes jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {workouts:true, recovery:false, ...}
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz
);
-- one live invite per (trainer, email); one link per (trainer, trainee)
CREATE UNIQUE INDEX coach_links_trainer_email_uq ON public.coach_links (trainer_id, lower(invited_email))
  WHERE status IN ('pending','accepted');
CREATE UNIQUE INDEX coach_links_trainer_trainee_uq ON public.coach_links (trainer_id, trainee_id)
  WHERE trainee_id IS NOT NULL;

-- Assigned plans (trainer → trainee)
CREATE TABLE public.assigned_plans (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainee_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  schedule    jsonb,               -- optional day → exercise mapping
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.assigned_plan_exercises (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id        uuid NOT NULL REFERENCES public.assigned_plans(id) ON DELETE CASCADE,
  name           text NOT NULL,
  muscle_group   text,
  default_sets   integer NOT NULL,
  default_reps   integer NOT NULL,
  default_weight float   NOT NULL,
  unit           text DEFAULT 'lbs',
  order_index    integer NOT NULL,
  day_label      text,               -- nullable
  exercise_db_id text
);
```

### Sharing scopes (keys in `shared_scopes`)
`workouts` (workouts + exercises), `prs`, `runs`, `recovery`, `sleep`, `strain`
(whoop_activities), `body_weight`, `food`, `profile` (body weight / height /
identity beyond name). Name is always visible once accepted so the roster can
render. Everything else defaults off.

## Security (RLS)

A `SECURITY DEFINER STABLE` helper centralizes the rule:

```sql
CREATE OR REPLACE FUNCTION public.coach_can_see(_trainee uuid, _scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_links cl
    WHERE cl.trainer_id = auth.uid()
      AND cl.trainee_id = _trainee
      AND cl.status = 'accepted'
      AND COALESCE((cl.shared_scopes ->> _scope)::boolean, false)
  );
$$;
```

Additive trainer-SELECT policies, one per table, e.g.:

```sql
CREATE POLICY coach_view_workouts ON public.workouts FOR SELECT
  USING (public.coach_can_see(user_id, 'workouts'));
CREATE POLICY coach_view_exercises ON public.exercises FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workouts w
                 WHERE w.id = exercises.workout_id
                   AND public.coach_can_see(w.user_id, 'workouts')));
-- whoop_cache split by cache_key:
CREATE POLICY coach_view_recovery ON public.whoop_cache FOR SELECT
  USING (cache_key LIKE 'recovery:%' AND public.coach_can_see(user_id, 'recovery'));
CREATE POLICY coach_view_sleep ON public.whoop_cache FOR SELECT
  USING (cache_key LIKE 'sleep:%'   AND public.coach_can_see(user_id, 'sleep'));
CREATE POLICY coach_view_strain ON public.whoop_cache FOR SELECT
  USING (cache_key LIKE 'cycles:%'  AND public.coach_can_see(user_id, 'strain'));
-- (verified cache_key format: 'recovery:<suffix>', 'sleep:<suffix>', 'cycles:<suffix>')
-- personal_records → 'prs', runs → 'runs', body_weight_logs → 'body_weight',
-- whoop_activities → 'strain', food_scans → 'food', profiles → 'profile'.
```

`coach_links` RLS: trainer manages rows where `trainer_id = auth.uid()`; a
trainee may SELECT/UPDATE rows where `trainee_id = auth.uid()` OR (`status =
'pending'` AND `lower(invited_email) = lower(auth.jwt() ->> 'email')`). Accept =
set `trainee_id = auth.uid()`, `status = 'accepted'`, `shared_scopes`,
`responded_at`. `assigned_plans` / `assigned_plan_exercises`: trainer full CRUD
on own rows; trainee SELECT where `trainee_id = auth.uid()`.

## Backend data layer (new files)

- `src/lib/coachLinks.ts` — `inviteTrainee(email)`, `getSentLinks()` (trainer),
  `getIncomingInvites()` / `getMyCoaches()` (trainee), `respondToInvite(id,
  accept, scopes)`, `updateShareScopes(id, scopes)`, `disconnect(id)`.
- `src/lib/coachData.ts` — trainer-side reads that take a `traineeId`:
  `getTraineeOverview(id)`, `getTraineeWorkouts(id)`, `getTraineeRecovery(id)`,
  `getTraineeRuns(id)`, `getTraineePRs(id)`, `getTraineeBodyWeight(id)`. RLS
  enforces scope; these just filter by `user_id`. Each returns a
  `{ shared: boolean, data }` shape so the UI can render "not shared" cleanly.
- `src/lib/assignedPlans.ts` — `assignPlan(traineeId, plan)`,
  `getAssignedPlansFor(traineeId)` (trainer), `getMyAssignedPlans()` (trainee),
  `updatePlan`, `archivePlan`.

## Frontend

### Trainer (`/coach`, guarded by `is_trainer`)
- **Roster** (`CoachDashboard`): trainee cards (name, readiness dot, last active,
  adherence), pending invites, and an **Invite** control — a single email field +
  Send. Nav gets a conditional "Coach" item (mobile nav stays ≤5 by swapping).
- **Trainee detail** (`/coach/trainee/:id`, `TraineeDetail`): reuses existing viz
  (`ThreeRingHero`, `MuscleMap`, `MuscleRadar`, `WeeklyRing`, recharts, `LoadInsights`).
  Sections, each degrading to a "not shared" card when the scope is off:
  readiness rings (recovery/sleep/strain), training-volume trend, muscle map +
  radar, session-frequency calendar, PR progression, recovery-vs-strain dual
  line, sleep bars, run pace/distance, body-weight trend, ACWR/training-load
  gauge, **plan-adherence donut**. "Assign plan" button opens the plan builder.

### Trainee
- **Settings → Coaches**: incoming invites ("\<Trainer\> invited you to coach
  you" → Accept/Decline; Accept opens the per-category scope sheet); connected
  coaches with scope toggles + Disconnect.
- **My Coach** (`/my-coach` + home badge): assigned plan(s) with coach name +
  notes and a **Start** button that loads the plan into the logger (reuses
  `buildEntriesFromPlan`). Badges for new invite / new plan.

### Theme / UX
Existing dark CSS-var theme, `AppIcon` registry (add `users`, `clipboard-list`,
`user-plus`, `link`/`unlink` icons), framer-motion per material-motion, 44px
touch targets, safe-area handling, empty + skeleton loading states, optimistic
accept, instant revoke.

## Build order (each slice shippable)

0. **Migration** — tables, `coach_can_see`, all RLS policies. Foundation.
1. **Link lifecycle** — `is_trainer` flag, invite-by-email, trainee Accept/Decline
   in Settings. End-to-end with no data views yet.
2. **Scopes** — per-category share toggles on accept + management; verify RLS.
3. **Trainer roster** — `/coach` list + invite UI.
4. **Trainee detail** — the full visualization dashboard.
5. **Assigned plans** — assign (trainer) + view/start (trainee).
6. **Polish** — empty/loading states, badges, edge cases.

## Non-goals (v1)
Real-time chat/messaging, in-app trainer billing/marketplace, a self-serve
"apply to be a trainer" approval flow (trainer flag is admin-granted; a note
marks where this slots in), trainer *editing* trainee-logged data.

## Risks / mitigations
- **RLS leak** → single audited `coach_can_see` helper; a verification step in
  the plan queries a trainee's rows as the trainer with each scope on/off.
- **Invite to a non-existent user** → the invite matches on email; it becomes
  actionable when that email signs up (matched at accept time via the JWT email).
- **Mobile nav crowding** → "Coach" shown only to trainers, swapped in rather
  than added as a 6th item.
