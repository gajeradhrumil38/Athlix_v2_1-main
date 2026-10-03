-- Closes the access holes in the trainer ↔ trainee feature found in the
-- 2026-10-02 trainer dashboard audit (docs/trainer-dashboard-test-plan.md).
--
-- 1) coach_links had no column-level guards. coach_links_trainer_all lets the
--    trainer INSERT/UPDATE any column of their own rows, so a trainer could
--    insert {status:'accepted', trainee_id:<anyone>, shared_scopes:{all:true}}
--    — or flip scopes on after the trainee accepted only some — and
--    coach_can_see() would then hand them that person's workouts, food, WHOOP
--    data and the ability to log workouts into their account. Consent must
--    come only from the trainee, so a trigger now pins who may change what.
-- 2) coach_notes (the trainer's private notes) lived on the link row, which
--    the trainee can SELECT — the trainee could read every private note.
--    Moved to a trainer-only table.
-- 3) coach_view_profile exposed the whole profile row (body weight, height)
--    to a trainer even with the body_weight scope off. Replaced with a narrow
--    definer function returning only name + sex.
-- 4) assigned_plans / trainer_appointments only checked trainer_id, so any
--    user could push plans/appointments (and their popups) onto ANY user id,
--    including someone who had disconnected. Writes now require an accepted
--    link (cancelling an existing appointment stays allowed).
-- 5) The (trainer, trainee) unique index counted revoked links, so a trainee
--    who disconnected could never accept a fresh invite from that trainer.

-- ── 1) coach_links column guard ─────────────────────────────────────
ALTER TABLE public.coach_links DROP CONSTRAINT IF EXISTS coach_links_not_self;
ALTER TABLE public.coach_links ADD CONSTRAINT coach_links_not_self CHECK (trainee_id IS NULL OR trainee_id <> trainer_id);

CREATE OR REPLACE FUNCTION public.coach_links_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Service role / SQL editor: no end-user identity, no restrictions.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A new link is always a bare pending invite; consent fields start empty.
    NEW.status        := 'pending';
    NEW.trainee_id    := NULL;
    NEW.shared_scopes := '{}'::jsonb;
    NEW.trainee_name  := NULL;
    NEW.responded_at  := NULL;
    NEW.created_at    := now();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.trainer_id IS DISTINCT FROM OLD.trainer_id
     OR NEW.invited_email IS DISTINCT FROM OLD.invited_email
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These link fields cannot be changed';
  END IF;

  IF v_uid = OLD.trainer_id THEN
    -- Trainer: may rename themselves or end the link — nothing else.
    IF NEW.trainee_id IS DISTINCT FROM OLD.trainee_id
       OR NEW.trainee_name IS DISTINCT FROM OLD.trainee_name
       OR NEW.responded_at IS DISTINCT FROM OLD.responded_at THEN
      RAISE EXCEPTION 'Only the trainee can change this';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status <> 'revoked' OR OLD.status NOT IN ('pending', 'accepted') THEN
        RAISE EXCEPTION 'A coach can only cancel or end a link';
      END IF;
      NEW.shared_scopes := '{}'::jsonb;
    ELSIF NEW.shared_scopes IS DISTINCT FROM OLD.shared_scopes THEN
      RAISE EXCEPTION 'Only the trainee can change what is shared';
    END IF;
    RETURN NEW;
  END IF;

  -- Trainee side (RLS already limited this to their own link / invite).
  IF NEW.trainer_name IS DISTINCT FROM OLD.trainer_name THEN
    RAISE EXCEPTION 'Only the coach can change this';
  END IF;
  IF NEW.trainee_id IS DISTINCT FROM OLD.trainee_id AND NEW.trainee_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'A link can only be claimed by yourself';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending'  AND NEW.status IN ('accepted', 'declined'))
      OR (OLD.status = 'accepted' AND NEW.status = 'revoked')
    ) THEN
      RAISE EXCEPTION 'Invalid link status change';
    END IF;
  END IF;
  IF NEW.status <> 'accepted' THEN
    NEW.shared_scopes := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_links_guard ON public.coach_links;
CREATE TRIGGER coach_links_guard
  BEFORE INSERT OR UPDATE ON public.coach_links
  FOR EACH ROW EXECUTE FUNCTION public.coach_links_guard();

-- ── 5) re-invite after disconnect ───────────────────────────────────
DROP INDEX IF EXISTS public.coach_links_trainer_trainee_uq;
CREATE UNIQUE INDEX coach_links_trainer_trainee_uq
  ON public.coach_links (trainer_id, trainee_id)
  WHERE trainee_id IS NOT NULL AND status = 'accepted';

-- ── 2) private coach notes, trainer-only ────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_private_notes (
  link_id    uuid PRIMARY KEY REFERENCES public.coach_links(id) ON DELETE CASCADE,
  trainer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_private_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_private_notes_owner ON public.coach_private_notes;
CREATE POLICY coach_private_notes_owner ON public.coach_private_notes
  FOR ALL USING (trainer_id = auth.uid())
  WITH CHECK (
    trainer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.coach_links cl WHERE cl.id = link_id AND cl.trainer_id = auth.uid())
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'coach_links' AND column_name = 'coach_notes') THEN
    INSERT INTO public.coach_private_notes (link_id, trainer_id, notes)
      SELECT id, trainer_id, coach_notes FROM public.coach_links
      WHERE coach_notes IS NOT NULL AND coach_notes <> ''
    ON CONFLICT (link_id) DO NOTHING;
    ALTER TABLE public.coach_links DROP COLUMN coach_notes;
  END IF;
END $$;

-- ── 3) narrow trainee identity for the coach ────────────────────────
DROP POLICY IF EXISTS coach_view_profile ON public.profiles;

CREATE OR REPLACE FUNCTION public.coach_trainee_identity(_trainee uuid)
RETURNS TABLE (full_name text, sex text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, p.sex::text
  FROM public.profiles p
  WHERE p.id = _trainee
    AND EXISTS (SELECT 1 FROM public.coach_links cl
                WHERE cl.trainer_id = auth.uid() AND cl.trainee_id = _trainee AND cl.status = 'accepted');
$$;
REVOKE ALL ON FUNCTION public.coach_trainee_identity(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_trainee_identity(uuid) TO authenticated;

-- ── 4) plans / appointments only for an accepted trainee ────────────
CREATE OR REPLACE FUNCTION public.is_my_trainee(_trainee uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.coach_links cl
                 WHERE cl.trainer_id = auth.uid() AND cl.trainee_id = _trainee AND cl.status = 'accepted');
$$;
REVOKE ALL ON FUNCTION public.is_my_trainee(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_my_trainee(uuid) TO authenticated;

DROP POLICY IF EXISTS assigned_plans_trainer_all ON public.assigned_plans;
CREATE POLICY assigned_plans_trainer_all ON public.assigned_plans
  FOR ALL USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid() AND public.is_my_trainee(trainee_id));

DROP POLICY IF EXISTS trainer_appointments_trainer_all ON public.trainer_appointments;
CREATE POLICY trainer_appointments_trainer_all ON public.trainer_appointments
  FOR ALL USING (trainer_id = auth.uid())
  WITH CHECK (
    trainer_id = auth.uid()
    AND (public.is_my_trainee(trainee_id) OR status = 'cancelled')
    AND (
      assigned_plan_id IS NULL
      OR EXISTS (SELECT 1 FROM public.assigned_plans p
                 WHERE p.id = assigned_plan_id AND p.trainer_id = auth.uid() AND p.trainee_id = trainer_appointments.trainee_id)
    )
  );

-- A deleted plan nulls assigned_plan_id (ON DELETE SET NULL) but left the
-- snapshotted title behind, so the card kept advertising a plan that no
-- longer exists. Keep the snapshot in step with the FK.
CREATE OR REPLACE FUNCTION public.trainer_appointments_sync_plan_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_plan_id IS NULL THEN
    NEW.assigned_plan_title := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trainer_appointments_sync_plan_title ON public.trainer_appointments;
CREATE TRIGGER trainer_appointments_sync_plan_title
  BEFORE INSERT OR UPDATE ON public.trainer_appointments
  FOR EACH ROW EXECUTE FUNCTION public.trainer_appointments_sync_plan_title();

-- Renaming a plan refreshes the title snapshot on its appointments. Definer:
-- the trainer owns both rows, but this keeps it independent of RLS ordering.
CREATE OR REPLACE FUNCTION public.assigned_plans_propagate_title()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    UPDATE public.trainer_appointments SET assigned_plan_title = NEW.title WHERE assigned_plan_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assigned_plans_propagate_title ON public.assigned_plans;
CREATE TRIGGER assigned_plans_propagate_title
  AFTER UPDATE OF title ON public.assigned_plans
  FOR EACH ROW EXECUTE FUNCTION public.assigned_plans_propagate_title();

-- Clean up any snapshot already orphaned by an earlier plan delete.
UPDATE public.trainer_appointments SET assigned_plan_title = NULL
WHERE assigned_plan_id IS NULL AND assigned_plan_title IS NOT NULL;

-- Realtime UPDATEs for appointments, so a reschedule/cancel reaches an open
-- trainee session (INSERT was already published).
ALTER TABLE public.trainer_appointments REPLICA IDENTITY FULL;
