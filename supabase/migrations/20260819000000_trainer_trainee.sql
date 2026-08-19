-- ─────────────────────────────────────────────────────────────────────────
-- Trainer ↔ Trainee coaching.
-- First cross-user data access in the app. A trainer invites a trainee by
-- email; once accepted, the trainer can SELECT the trainee's rows ONLY for the
-- categories the trainee toggled on, enforced entirely in the database by the
-- coach_can_see() helper + additive per-table SELECT policies. RLS policies are
-- OR-ed, so every existing "own rows only" policy is untouched — the trainer
-- simply gains an extra, tightly-scoped read path. Flip a scope off or
-- disconnect and the rows disappear on the next query. Trainers never get write
-- access to trainee data.
-- Spec: docs/superpowers/specs/2026-08-19-trainer-trainee-coaching-design.md
-- ─────────────────────────────────────────────────────────────────────────

-- ── Trainer role + public-facing trainer identity ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_trainer           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trainer_display_name text,
  ADD COLUMN IF NOT EXISTS trainer_bio          text;

-- ── The relationship + per-category consent ──
CREATE TABLE IF NOT EXISTS public.coach_links (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainee_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,   -- null until accepted
  invited_email text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','revoked')),
  shared_scopes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz
);
-- one live invite per (trainer, email); one link per (trainer, trainee)
CREATE UNIQUE INDEX IF NOT EXISTS coach_links_trainer_email_uq
  ON public.coach_links (trainer_id, lower(invited_email))
  WHERE status IN ('pending','accepted');
CREATE UNIQUE INDEX IF NOT EXISTS coach_links_trainer_trainee_uq
  ON public.coach_links (trainer_id, trainee_id)
  WHERE trainee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_links_trainee_idx ON public.coach_links (trainee_id);
CREATE INDEX IF NOT EXISTS coach_links_email_idx   ON public.coach_links (lower(invited_email));

-- ── Assigned plans (trainer → trainee) ──
CREATE TABLE IF NOT EXISTS public.assigned_plans (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainee_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  schedule    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assigned_plans_trainee_idx ON public.assigned_plans (trainee_id, status);
CREATE INDEX IF NOT EXISTS assigned_plans_trainer_idx ON public.assigned_plans (trainer_id);

CREATE TABLE IF NOT EXISTS public.assigned_plan_exercises (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id        uuid NOT NULL REFERENCES public.assigned_plans(id) ON DELETE CASCADE,
  name           text NOT NULL,
  muscle_group   text,
  default_sets   integer NOT NULL,
  default_reps   integer NOT NULL,
  default_weight float   NOT NULL,
  unit           text DEFAULT 'lbs',
  order_index    integer NOT NULL,
  day_label      text,
  exercise_db_id text
);
CREATE INDEX IF NOT EXISTS assigned_plan_exercises_plan_idx ON public.assigned_plan_exercises (plan_id);

-- ── Scope-gate helper — the single audited chokepoint ──
-- True only when the caller is an ACCEPTED trainer of _trainee AND the trainee
-- has toggled _scope on. SECURITY DEFINER so it can read coach_links regardless
-- of the caller's own policies; STABLE + pinned search_path.
CREATE OR REPLACE FUNCTION public.coach_can_see(_trainee uuid, _scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_links cl
    WHERE cl.trainer_id = auth.uid()
      AND cl.trainee_id = _trainee
      AND cl.status = 'accepted'
      AND COALESCE((cl.shared_scopes ->> _scope)::boolean, false)
  );
$$;
REVOKE ALL ON FUNCTION public.coach_can_see(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_can_see(uuid, text) TO authenticated;

-- ── RLS on the new tables ──
ALTER TABLE public.coach_links            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assigned_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assigned_plan_exercises ENABLE ROW LEVEL SECURITY;

-- coach_links: trainer owns their rows; trainee sees/acts on links addressed to
-- them (already linked, or a pending invite matched by their verified email).
DROP POLICY IF EXISTS coach_links_trainer_all ON public.coach_links;
CREATE POLICY coach_links_trainer_all ON public.coach_links
  FOR ALL USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS coach_links_trainee_select ON public.coach_links;
CREATE POLICY coach_links_trainee_select ON public.coach_links
  FOR SELECT USING (
    trainee_id = auth.uid()
    OR (status = 'pending' AND lower(invited_email) = lower(auth.jwt() ->> 'email'))
  );

-- Trainee accepts/declines: may update a link that is theirs (by id already set)
-- or a pending invite to their email. WITH CHECK keeps them from reassigning it
-- to someone else — trainee_id must be their own uid or stay null.
DROP POLICY IF EXISTS coach_links_trainee_update ON public.coach_links;
CREATE POLICY coach_links_trainee_update ON public.coach_links
  FOR UPDATE USING (
    trainee_id = auth.uid()
    OR (status = 'pending' AND lower(invited_email) = lower(auth.jwt() ->> 'email'))
  ) WITH CHECK (
    trainee_id = auth.uid()
    OR (status <> 'accepted' AND trainee_id IS NULL)
  );

-- assigned_plans: trainer full CRUD on own rows; trainee reads plans for them.
DROP POLICY IF EXISTS assigned_plans_trainer_all ON public.assigned_plans;
CREATE POLICY assigned_plans_trainer_all ON public.assigned_plans
  FOR ALL USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());
DROP POLICY IF EXISTS assigned_plans_trainee_select ON public.assigned_plans;
CREATE POLICY assigned_plans_trainee_select ON public.assigned_plans
  FOR SELECT USING (trainee_id = auth.uid());

-- assigned_plan_exercises: inherit access from the parent plan.
DROP POLICY IF EXISTS assigned_plan_exercises_trainer_all ON public.assigned_plan_exercises;
CREATE POLICY assigned_plan_exercises_trainer_all ON public.assigned_plan_exercises
  FOR ALL USING (EXISTS (SELECT 1 FROM public.assigned_plans p
                         WHERE p.id = assigned_plan_exercises.plan_id AND p.trainer_id = auth.uid()))
         WITH CHECK (EXISTS (SELECT 1 FROM public.assigned_plans p
                             WHERE p.id = assigned_plan_exercises.plan_id AND p.trainer_id = auth.uid()));
DROP POLICY IF EXISTS assigned_plan_exercises_trainee_select ON public.assigned_plan_exercises;
CREATE POLICY assigned_plan_exercises_trainee_select ON public.assigned_plan_exercises
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.assigned_plans p
                            WHERE p.id = assigned_plan_exercises.plan_id AND p.trainee_id = auth.uid()));

-- ── Additive trainer-SELECT policies on trainee data (scope-gated) ──
DROP POLICY IF EXISTS coach_view_profile ON public.profiles;
CREATE POLICY coach_view_profile ON public.profiles
  FOR SELECT USING (
    -- name/identity visible to any accepted trainer (roster needs it); other
    -- profile fields are only meaningful under the 'profile' scope, but the row
    -- gate is: accepted trainer of this profile owner.
    EXISTS (SELECT 1 FROM public.coach_links cl
            WHERE cl.trainer_id = auth.uid() AND cl.trainee_id = profiles.id AND cl.status = 'accepted')
  );

DROP POLICY IF EXISTS coach_view_workouts ON public.workouts;
CREATE POLICY coach_view_workouts ON public.workouts
  FOR SELECT USING (public.coach_can_see(user_id, 'workouts'));

DROP POLICY IF EXISTS coach_view_exercises ON public.exercises;
CREATE POLICY coach_view_exercises ON public.exercises
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.workouts w
                            WHERE w.id = exercises.workout_id
                              AND public.coach_can_see(w.user_id, 'workouts')));

DROP POLICY IF EXISTS coach_view_prs ON public.personal_records;
CREATE POLICY coach_view_prs ON public.personal_records
  FOR SELECT USING (public.coach_can_see(user_id, 'prs'));

DROP POLICY IF EXISTS coach_view_runs ON public.runs;
CREATE POLICY coach_view_runs ON public.runs
  FOR SELECT USING (public.coach_can_see(user_id, 'runs'));

DROP POLICY IF EXISTS coach_view_body_weight ON public.body_weight_logs;
CREATE POLICY coach_view_body_weight ON public.body_weight_logs
  FOR SELECT USING (public.coach_can_see(user_id, 'body_weight'));

DROP POLICY IF EXISTS coach_view_food ON public.food_scans;
CREATE POLICY coach_view_food ON public.food_scans
  FOR SELECT USING (public.coach_can_see(user_id, 'food'));

DROP POLICY IF EXISTS coach_view_activities ON public.whoop_activities;
CREATE POLICY coach_view_activities ON public.whoop_activities
  FOR SELECT USING (public.coach_can_see(user_id, 'strain'));

-- whoop_cache holds recovery/sleep/cycles keyed by cache_key ('recovery:<s>',
-- 'sleep:<s>', 'cycles:<s>') — gate each data type to its own scope.
DROP POLICY IF EXISTS coach_view_recovery ON public.whoop_cache;
CREATE POLICY coach_view_recovery ON public.whoop_cache
  FOR SELECT USING (cache_key LIKE 'recovery:%' AND public.coach_can_see(user_id, 'recovery'));
DROP POLICY IF EXISTS coach_view_sleep ON public.whoop_cache;
CREATE POLICY coach_view_sleep ON public.whoop_cache
  FOR SELECT USING (cache_key LIKE 'sleep:%' AND public.coach_can_see(user_id, 'sleep'));
DROP POLICY IF EXISTS coach_view_strain ON public.whoop_cache;
CREATE POLICY coach_view_strain ON public.whoop_cache
  FOR SELECT USING (cache_key LIKE 'cycles:%' AND public.coach_can_see(user_id, 'strain'));
