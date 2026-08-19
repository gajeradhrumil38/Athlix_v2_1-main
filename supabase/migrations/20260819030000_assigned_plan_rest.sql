-- Prescribe rest between sets on assigned exercises (program builder).
ALTER TABLE public.assigned_plan_exercises
  ADD COLUMN IF NOT EXISTS rest_seconds integer;
