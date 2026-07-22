-- Fix: default unit was 'kg' everywhere; app should default to 'lbs'.
-- This migration:
--   1. Changes column DEFAULTs from 'kg' → 'lbs' on profiles
--   2. Updates the handle_new_user trigger to explicitly insert 'lbs'
--   3. Patches any existing profile rows that still have 'kg' set by the
--      old trigger default (i.e. rows where the user never changed the unit)

-- 1. Fix column defaults so new rows inserted without an explicit unit get 'lbs'
ALTER TABLE public.profiles
  ALTER COLUMN unit_preference SET DEFAULT 'lbs';

ALTER TABLE public.profiles
  ALTER COLUMN body_weight_unit SET DEFAULT 'lbs';

-- 2. Update the trigger so new sign-ups explicitly receive 'lbs'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, unit_preference, body_weight_unit)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'lbs', 'lbs')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill: fix existing profiles where unit is still the old 'kg' default
--    and the user has never logged any weight (body_weight IS NULL means they
--    never touched the unit toggle — safe to assume they want the app default).
UPDATE public.profiles
SET
  unit_preference  = 'lbs',
  body_weight_unit = 'lbs'
WHERE
  unit_preference  = 'kg'
  AND body_weight_unit = 'kg'
  AND body_weight IS NULL;
