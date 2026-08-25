-- Post-session notes: how the appointment actually went, filled in by the
-- trainer after marking it completed. Separate column from `notes` (which
-- is the PRE-session "what we'll do" field) so both survive independently
-- and a completed appointment carries a before/after record.
alter table public.trainer_appointments
  add column if not exists review_notes text;
