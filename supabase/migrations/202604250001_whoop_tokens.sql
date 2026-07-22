CREATE TABLE public.whoop_tokens (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  whoop_user_id INTEGER,
  connected_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.whoop_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read and delete their own row
CREATE POLICY "users_read_own_whoop_token"
  ON public.whoop_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_whoop_token"
  ON public.whoop_tokens FOR DELETE
  USING (auth.uid() = user_id);
-- INSERT / UPDATE is done exclusively by the edge function via service role key
