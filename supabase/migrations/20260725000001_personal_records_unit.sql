-- personal_records had no way to track which unit best_weight was stored
-- in, unlike exercises/template_exercises/body_weight_logs. This made the
-- bulk unit-conversion in convertAllUserDataUnits() non-idempotent: it
-- always assumed every row was still in the OLD unit and converted again,
-- with no way to detect a row had already been converted. Any repeated
-- conversion (double-toggle, retry, etc.) permanently compounded the
-- value. Adding a per-row unit column, mirroring the other tables' pattern,
-- makes the conversion self-correcting and idempotent going forward.
ALTER TABLE public.personal_records
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'lbs' CHECK (unit IN ('kg', 'lbs'));
