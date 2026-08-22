-- Private notes a trainer keeps on a trainee (injuries, goals, cues). Owned by
-- the trainer via the existing coach_links RLS (trainer full CRUD on own rows);
-- the trainee never reads it (their SELECT policy is scoped, but this is the
-- trainer's own row anyway).
ALTER TABLE public.coach_links ADD COLUMN IF NOT EXISTS coach_notes text;
