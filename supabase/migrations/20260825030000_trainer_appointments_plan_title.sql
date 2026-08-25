-- Snapshot the attached plan's title too, same denormalize-to-avoid-a-join
-- convention as trainer_name/trainee_name — the calendar card can show
-- "Plan: Push Day" without a second query per appointment.
ALTER TABLE public.trainer_appointments
  ADD COLUMN IF NOT EXISTS assigned_plan_title text;
