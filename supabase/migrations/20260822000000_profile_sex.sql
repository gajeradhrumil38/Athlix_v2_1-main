-- Body model for the muscle map (male/female). Nullable — absent means the map
-- falls back to the male model. Purely presentational; no other behavior depends
-- on it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sex text CHECK (sex IN ('male', 'female'));
