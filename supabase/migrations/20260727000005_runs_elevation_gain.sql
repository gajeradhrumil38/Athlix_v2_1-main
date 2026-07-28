-- Adds elevation gain tracking to runs, part of the Running feature
-- improvements (auto-pause, voice cues, elevation gain).
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS elevation_gain DOUBLE PRECISION NOT NULL DEFAULT 0;
