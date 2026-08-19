-- Let the new-user trigger seed is_trainer from signup metadata, so BOTH signup
-- surfaces (the Next.js /signup page and the SPA Auth page) can create a coach
-- account just by passing options.data.is_trainer at supabase.auth.signUp().
-- Keeps the hardening from 20260727000002 (pinned search_path, revoked grants).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, unit_preference, body_weight_unit, is_trainer)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    'lbs',
    'lbs',
    COALESCE((new.raw_user_meta_data->>'is_trainer')::boolean, false)
  );
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
