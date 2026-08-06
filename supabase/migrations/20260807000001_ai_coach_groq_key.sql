-- Per-user Groq API key for the AI coach. Groq is the primary provider (much
-- larger free quota, no per-user Gemini model restrictions); storing the key
-- per user means each person spends their own Groq rate/quota instead of a
-- shared server key. RLS on ai_coach_keys already restricts rows to the owner.

alter table public.ai_coach_keys
  add column if not exists groq_api_key text;
