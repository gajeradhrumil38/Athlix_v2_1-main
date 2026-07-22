ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS muscle_slugs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.exercise_library.muscle_slugs IS
  'Array of {slug, type} objects e.g. [{"slug":"chest","type":"primary"},{"slug":"triceps","type":"secondary"}]';
