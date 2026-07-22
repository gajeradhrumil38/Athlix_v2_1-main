-- Make refresh_token nullable so manual-token connect() can work
ALTER TABLE public.whoop_tokens
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Create the whoop_cache table referenced by the edge function
CREATE TABLE IF NOT EXISTS public.whoop_cache (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key   TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, cache_key)
);

ALTER TABLE public.whoop_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_whoop_cache"
  ON public.whoop_cache FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT / UPDATE done via service role key in the edge function
