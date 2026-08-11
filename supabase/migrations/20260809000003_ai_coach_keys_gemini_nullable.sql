-- Groq is now the coach's primary provider, so a user may save ONLY a Groq key
-- (no Gemini key). gemini_api_key was NOT NULL, which failed those inserts
-- ("Could not save Groq key"). Make it nullable so a Groq-only row is valid.

alter table public.ai_coach_keys
  alter column gemini_api_key drop not null;
