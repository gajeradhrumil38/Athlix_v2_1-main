CREATE TABLE public.ai_coach_keys (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gemini_api_key  TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.ai_coach_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_ai_coach_key"
  ON public.ai_coach_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
