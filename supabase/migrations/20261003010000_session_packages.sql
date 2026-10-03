-- Session packages for in-person coaching ("12 sessions, $600") plus a
-- no-show status on appointments.
--
-- Sessions used are NOT stored: they are the trainer's appointments with this
-- trainee marked 'completed' (attended) — and 'no_show' when the package
-- charges for them — dated inside the package's window. One source of truth,
-- so the count can't drift from the calendar.

ALTER TABLE public.trainer_appointments DROP CONSTRAINT IF EXISTS trainer_appointments_status_check;
ALTER TABLE public.trainer_appointments
  ADD CONSTRAINT trainer_appointments_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'));

CREATE TABLE IF NOT EXISTS public.session_packages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id          uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  trainee_id          uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title               text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  total_sessions      integer NOT NULL CHECK (total_sessions BETWEEN 1 AND 500),
  price               numeric(10, 2) CHECK (price IS NULL OR price >= 0),
  starts_on           date NOT NULL DEFAULT current_date,
  expires_on          date CHECK (expires_on IS NULL OR expires_on >= starts_on),
  count_no_shows      boolean NOT NULL DEFAULT true,
  notes               text,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_packages_trainer_trainee_idx
  ON public.session_packages (trainer_id, trainee_id, starts_on DESC);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

-- The trainer manages their own packages, and only for a current trainee.
DROP POLICY IF EXISTS session_packages_trainer_all ON public.session_packages;
CREATE POLICY session_packages_trainer_all ON public.session_packages
  FOR ALL USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND public.is_my_trainee(trainee_id));

-- The trainee can see their own packages (how many sessions they have left).
DROP POLICY IF EXISTS session_packages_trainee_select ON public.session_packages;
CREATE POLICY session_packages_trainee_select ON public.session_packages
  FOR SELECT USING (trainee_id = auth.uid());
