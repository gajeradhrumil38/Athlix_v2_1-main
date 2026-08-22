-- Per-exercise coaching note (cue / tempo / RPE) the trainer sets and the
-- trainee sees on the assigned plan.
ALTER TABLE public.assigned_plan_exercises ADD COLUMN IF NOT EXISTS note text;
