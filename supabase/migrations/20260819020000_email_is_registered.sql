-- Lets the coach invite flow tell whether an invited email already belongs to an
-- Athlix account, so we can show an in-app invite (registered) vs. prompt the
-- coach to get them to sign up (not registered). Returns only a boolean — no
-- user data leaks. SECURITY DEFINER so it can read auth.users; pinned search_path.
CREATE OR REPLACE FUNCTION public.email_is_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.email_is_registered(text) FROM public;
GRANT EXECUTE ON FUNCTION public.email_is_registered(text) TO authenticated;
