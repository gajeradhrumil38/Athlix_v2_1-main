-- Backfills the `runs` table into migration history. It already exists
-- live (created ad hoc, outside any tracked migration or schema.sql) and
-- is what src/features/running/utils/storage.ts's saveRunToCloud() /
-- loadRunsFromCloud() / deleteRunFromCloud() read and write -- found while
-- auditing the Running feature. Without this, a fresh database built from
-- schema.sql + migrations would be missing the table entirely and the
-- Running feature's cloud sync would fail outright. IF NOT EXISTS /
-- idempotent throughout, so this is a no-op against the live database,
-- which already has this exact shape.
CREATE TABLE IF NOT EXISTS public.runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  run_ts      BIGINT NOT NULL,
  distance    DOUBLE PRECISION NOT NULL,
  duration    BIGINT NOT NULL,
  pace        DOUBLE PRECISION NOT NULL,
  path        JSONB NOT NULL DEFAULT '[]'::jsonb,
  splits      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_user_ts ON public.runs (user_id, run_ts DESC);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_runs" ON public.runs;
CREATE POLICY "users_own_runs" ON public.runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
