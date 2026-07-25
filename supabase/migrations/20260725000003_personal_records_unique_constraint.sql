-- schema.sql has declared this constraint since an earlier migration
-- (guarded by an IF NOT EXISTS check), but it was never actually applied
-- to the live database — confirmed via pg_constraint, which showed only
-- the primary key, unit check, and user_id foreign key on personal_records.
-- This meant ON CONFLICT (user_id, exercise_name) in save_workout_with_sets
-- had no matching unique constraint to target. No duplicate (user_id,
-- exercise_name) pairs exist currently, so this is safe to add now.
ALTER TABLE public.personal_records
  ADD CONSTRAINT personal_records_user_exercise_name_key
  UNIQUE (user_id, exercise_name);
