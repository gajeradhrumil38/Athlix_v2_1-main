-- Snapshot both display names on the row, same convention already used by
-- coach_links ("neither side needs a cross-user profile read"). Without
-- this, rendering "Appointment with <trainer>" on the trainee's calendar
-- would need a join into a profile the trainee has no RLS access to.
ALTER TABLE public.trainer_appointments
  ADD COLUMN IF NOT EXISTS trainer_name text,
  ADD COLUMN IF NOT EXISTS trainee_name text;
