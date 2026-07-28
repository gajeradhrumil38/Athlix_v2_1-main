-- Links a run to the workout log entry created alongside it (only happens
-- for logged-in users — see ActiveRun.tsx's handleStop()), so deleting a
-- run from Run History can cascade-delete the matching Log/Calendar entry.
-- Nullable and additive: existing runs get NULL and simply have nothing to
-- cascade to when deleted, which is the expected/documented behavior for
-- runs saved before this shipped.
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL;
