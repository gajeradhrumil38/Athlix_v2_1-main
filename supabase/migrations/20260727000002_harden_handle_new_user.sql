-- Security hardening flagged by Supabase's advisor: handle_new_user() (the
-- on_auth_user_created trigger that seeds a new profiles row) had a mutable
-- search_path -- a SECURITY DEFINER function without a pinned search_path
-- is a known privilege-escalation vector (a role with schema-creation
-- rights could shadow an unqualified object it references). It was also
-- directly callable via /rest/v1/rpc/handle_new_user by anon and
-- authenticated, even though it's only ever meant to fire from the auth
-- trigger, never invoked directly by a client.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, unit_preference, body_weight_unit)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'lbs', 'lbs');
  RETURN new;
END;
$$;

-- Revoking from anon/authenticated alone isn't enough: CREATE OR REPLACE
-- resets a function's grants to Postgres's default (EXECUTE TO PUBLIC),
-- and a PUBLIC grant applies to every role regardless of individual
-- REVOKEs. PUBLIC has to be revoked explicitly too.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
