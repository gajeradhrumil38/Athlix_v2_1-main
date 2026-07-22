-- Bring remote schema in line with app expectations without dropping data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Missing profile fields used by the app UI/preferences.
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS start_workout_enabled BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS show_start_sheet BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS body_weight DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS body_weight_unit TEXT DEFAULT 'lbs',
  ADD COLUMN IF NOT EXISTS height_feet INTEGER,
  ADD COLUMN IF NOT EXISTS height_inches INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'body_weight_unit'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_body_weight_unit_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_body_weight_unit_check
      CHECK (body_weight_unit IN ('kg', 'lbs'));
  END IF;
END
$$;

-- Missing exercise columns for log-workout flow and exercise matching.
ALTER TABLE IF EXISTS public.exercises
  ADD COLUMN IF NOT EXISTS muscle_group TEXT,
  ADD COLUMN IF NOT EXISTS exercise_db_id TEXT;

ALTER TABLE IF EXISTS public.template_exercises
  ADD COLUMN IF NOT EXISTS muscle_group TEXT,
  ADD COLUMN IF NOT EXISTS exercise_db_id TEXT;

ALTER TABLE IF EXISTS public.personal_records
  ADD COLUMN IF NOT EXISTS exercise_db_id TEXT;

ALTER TABLE IF EXISTS public.exercise_library
  ADD COLUMN IF NOT EXISTS exercise_db_id TEXT;

-- Missing rest timer table.
CREATE TABLE IF NOT EXISTS public.rest_timer_preferences (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  default_duration_seconds INTEGER DEFAULT 90
);

-- Missing heart-rate tables.
CREATE TABLE IF NOT EXISTS public.heart_rate_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Heart Rate Device',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  disconnected_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.heart_rate_samples (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.heart_rate_sessions ON DELETE CASCADE NOT NULL,
  ts BIGINT NOT NULL,
  bpm INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS and policies for missing tables.
ALTER TABLE IF EXISTS public.rest_timer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.heart_rate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.heart_rate_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own rest timer preferences" ON public.rest_timer_preferences;
DROP POLICY IF EXISTS "Users can insert their own rest timer preferences" ON public.rest_timer_preferences;
DROP POLICY IF EXISTS "Users can update their own rest timer preferences" ON public.rest_timer_preferences;

CREATE POLICY "Users can view their own rest timer preferences"
ON public.rest_timer_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own rest timer preferences"
ON public.rest_timer_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rest timer preferences"
ON public.rest_timer_preferences FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own heart rate sessions" ON public.heart_rate_sessions;
DROP POLICY IF EXISTS "Users can insert their own heart rate sessions" ON public.heart_rate_sessions;
DROP POLICY IF EXISTS "Users can update their own heart rate sessions" ON public.heart_rate_sessions;
DROP POLICY IF EXISTS "Users can delete their own heart rate sessions" ON public.heart_rate_sessions;

CREATE POLICY "Users can view their own heart rate sessions"
ON public.heart_rate_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own heart rate sessions"
ON public.heart_rate_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own heart rate sessions"
ON public.heart_rate_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own heart rate sessions"
ON public.heart_rate_sessions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own heart rate samples" ON public.heart_rate_samples;
DROP POLICY IF EXISTS "Users can insert their own heart rate samples" ON public.heart_rate_samples;
DROP POLICY IF EXISTS "Users can update their own heart rate samples" ON public.heart_rate_samples;
DROP POLICY IF EXISTS "Users can delete their own heart rate samples" ON public.heart_rate_samples;

CREATE POLICY "Users can view their own heart rate samples"
ON public.heart_rate_samples FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own heart rate samples"
ON public.heart_rate_samples FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own heart rate samples"
ON public.heart_rate_samples FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own heart rate samples"
ON public.heart_rate_samples FOR DELETE USING (auth.uid() = user_id);

-- Helpful indexes used by app queries.
CREATE INDEX IF NOT EXISTS heart_rate_sessions_user_connected_idx
  ON public.heart_rate_sessions (user_id, connected_at DESC);
CREATE INDEX IF NOT EXISTS heart_rate_samples_user_ts_idx
  ON public.heart_rate_samples (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS heart_rate_samples_session_ts_idx
  ON public.heart_rate_samples (session_id, ts);
