-- Trainer-created appointments (scheduled sessions), distinct from assigned
-- plans: a plan is "what to do", an appointment is "when we're doing it" —
-- optionally pointing at a plan, but not required to (e.g. a check-in call,
-- an in-person session with notes but no formal prescription yet).
CREATE TABLE IF NOT EXISTS public.trainer_appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainee_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text NOT NULL,
  notes             text,
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  integer,
  status            text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  assigned_plan_id  uuid REFERENCES public.assigned_plans(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trainer_appointments_trainee_idx ON public.trainer_appointments (trainee_id, scheduled_at);
CREATE INDEX IF NOT EXISTS trainer_appointments_trainer_idx ON public.trainer_appointments (trainer_id, scheduled_at);

ALTER TABLE public.trainer_appointments ENABLE ROW LEVEL SECURITY;

-- Same shape as assigned_plans: trainer has full CRUD on appointments they
-- created, trainee can read appointments made for them.
DROP POLICY IF EXISTS trainer_appointments_trainer_all ON public.trainer_appointments;
CREATE POLICY trainer_appointments_trainer_all ON public.trainer_appointments
  FOR ALL USING (trainer_id = auth.uid()) WITH CHECK (trainer_id = auth.uid());

DROP POLICY IF EXISTS trainer_appointments_trainee_select ON public.trainer_appointments;
CREATE POLICY trainer_appointments_trainee_select ON public.trainer_appointments
  FOR SELECT USING (trainee_id = auth.uid());

-- Realtime, matching assigned_plans — so a trainee's already-open session
-- sees a new appointment show up live, same as the assigned-plan popup.
ALTER PUBLICATION supabase_realtime ADD TABLE public.trainer_appointments;
