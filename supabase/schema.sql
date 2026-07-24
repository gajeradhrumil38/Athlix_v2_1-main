-- Supabase Schema for Athlix

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  unit_preference TEXT DEFAULT 'lbs' CHECK (unit_preference IN ('kg', 'lbs')),
  theme_preference TEXT DEFAULT 'dark' CHECK (theme_preference IN ('dark', 'darker')),
  start_workout_enabled BOOLEAN DEFAULT false NOT NULL,
  show_start_sheet BOOLEAN DEFAULT false NOT NULL,
  body_weight DOUBLE PRECISION,
  body_weight_unit TEXT DEFAULT 'lbs' CHECK (body_weight_unit IN ('kg', 'lbs')),
  height_feet INTEGER,
  height_inches INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Workouts table
CREATE TABLE public.workouts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  muscle_groups TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Exercises table
CREATE TABLE public.exercises (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workout_id UUID REFERENCES public.workouts ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight FLOAT NOT NULL,
  unit TEXT DEFAULT 'lbs' CHECK (unit IN ('kg', 'lbs', 'km', 'mi')),
  order_index INTEGER NOT NULL,
  exercise_db_id TEXT
);

-- Templates table
CREATE TABLE public.templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Template Exercises table
CREATE TABLE public.template_exercises (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_id UUID REFERENCES public.templates ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  muscle_group TEXT,
  default_sets INTEGER NOT NULL,
  default_reps INTEGER NOT NULL,
  default_weight FLOAT NOT NULL,
  order_index INTEGER NOT NULL,
  exercise_db_id TEXT
);

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Workouts Policies
CREATE POLICY "Users can view their own workouts" ON public.workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own workouts" ON public.workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workouts" ON public.workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own workouts" ON public.workouts FOR DELETE USING (auth.uid() = user_id);

-- Exercises Policies
CREATE POLICY "Users can view their own exercises" ON public.exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own exercises" ON public.exercises FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can update their own exercises" ON public.exercises FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);
CREATE POLICY "Users can delete their own exercises" ON public.exercises FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
);

-- Templates Policies
CREATE POLICY "Users can view their own templates" ON public.templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own templates" ON public.templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own templates" ON public.templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own templates" ON public.templates FOR DELETE USING (auth.uid() = user_id);

-- Template Exercises Policies
CREATE POLICY "Users can view their own template exercises" ON public.template_exercises FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can insert their own template exercises" ON public.template_exercises FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can update their own template exercises" ON public.template_exercises FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);
CREATE POLICY "Users can delete their own template exercises" ON public.template_exercises FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.templates t WHERE t.id = template_id AND t.user_id = auth.uid())
);

-- Body Weight Logs
CREATE TABLE public.body_weight_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  weight FLOAT NOT NULL,
  unit TEXT DEFAULT 'lbs' CHECK (unit IN ('kg', 'lbs')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Personal Records
CREATE TABLE public.personal_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  best_weight FLOAT NOT NULL,
  best_reps INTEGER NOT NULL,
  achieved_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  exercise_db_id TEXT
);

-- Exercise Library
CREATE TABLE public.exercise_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  exercise_db_id TEXT,
  muscle_slugs JSONB DEFAULT '[]'::jsonb
);

-- Exercise Type Overrides (per-user input-type preference, keyed by normalized exercise name)
CREATE TABLE public.exercise_type_overrides (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  input_type TEXT NOT NULL CHECK (input_type IN ('weight_reps', 'reps_only', 'time_only', 'distance_only')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, exercise_name)
);

-- Exercise Goals (per-user strength target for a specific exercise)
CREATE TABLE public.exercise_goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  target_weight NUMERIC NOT NULL CHECK (target_weight > 0),
  target_reps INTEGER NOT NULL CHECK (target_reps > 0),
  unit TEXT NOT NULL CHECK (unit IN ('kg','lbs')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved')),
  achieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Rest Timer Preferences
CREATE TABLE public.rest_timer_preferences (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  default_duration_seconds INTEGER DEFAULT 90
);

-- Heart Rate Sessions
CREATE TABLE public.heart_rate_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Heart Rate Device',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  disconnected_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Heart Rate Samples
CREATE TABLE public.heart_rate_samples (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.heart_rate_sessions ON DELETE CASCADE NOT NULL,
  ts BIGINT NOT NULL,
  bpm INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.body_weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_type_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rest_timer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heart_rate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heart_rate_samples ENABLE ROW LEVEL SECURITY;

-- Policies for body_weight_logs
CREATE POLICY "Users can view their own body weight logs" ON public.body_weight_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own body weight logs" ON public.body_weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own body weight logs" ON public.body_weight_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own body weight logs" ON public.body_weight_logs FOR DELETE USING (auth.uid() = user_id);

-- Policies for personal_records
CREATE POLICY "Users can view their own personal records" ON public.personal_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own personal records" ON public.personal_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own personal records" ON public.personal_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own personal records" ON public.personal_records FOR DELETE USING (auth.uid() = user_id);

-- Policies for exercise_library
CREATE POLICY "Users can view default and their own custom exercises" ON public.exercise_library FOR SELECT USING (is_custom = false OR auth.uid() = user_id);
CREATE POLICY "Users can insert their own custom exercises" ON public.exercise_library FOR INSERT WITH CHECK (is_custom = true AND auth.uid() = user_id);
CREATE POLICY "Users can update their own custom exercises" ON public.exercise_library FOR UPDATE USING (is_custom = true AND auth.uid() = user_id);
CREATE POLICY "Users can delete their own custom exercises" ON public.exercise_library FOR DELETE USING (is_custom = true AND auth.uid() = user_id);

-- Policies for exercise_type_overrides
CREATE POLICY "Users can view their own exercise type overrides" ON public.exercise_type_overrides FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own exercise type overrides" ON public.exercise_type_overrides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exercise type overrides" ON public.exercise_type_overrides FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exercise type overrides" ON public.exercise_type_overrides FOR DELETE USING (auth.uid() = user_id);

-- Policies for exercise_goals
CREATE POLICY "Users can view their own exercise goals" ON public.exercise_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own exercise goals" ON public.exercise_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exercise goals" ON public.exercise_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exercise goals" ON public.exercise_goals FOR DELETE USING (auth.uid() = user_id);

-- Policies for rest_timer_preferences
CREATE POLICY "Users can view their own rest timer preferences" ON public.rest_timer_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own rest timer preferences" ON public.rest_timer_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own rest timer preferences" ON public.rest_timer_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Policies for heart_rate_sessions
CREATE POLICY "Users can view their own heart rate sessions" ON public.heart_rate_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own heart rate sessions" ON public.heart_rate_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own heart rate sessions" ON public.heart_rate_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own heart rate sessions" ON public.heart_rate_sessions FOR DELETE USING (auth.uid() = user_id);

-- Policies for heart_rate_samples
CREATE POLICY "Users can view their own heart rate samples" ON public.heart_rate_samples FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own heart rate samples" ON public.heart_rate_samples FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own heart rate samples" ON public.heart_rate_samples FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own heart rate samples" ON public.heart_rate_samples FOR DELETE USING (auth.uid() = user_id);

-- Insert default exercises
INSERT INTO public.exercise_library (name, muscle_group, is_custom) VALUES
('Bench Press', 'Chest', false), ('Incline Bench Press', 'Chest', false), ('Decline Bench Press', 'Chest', false), ('Dumbbell Flyes', 'Chest', false), ('Cable Crossover', 'Chest', false), ('Push-Ups', 'Chest', false), ('Chest Dips', 'Chest', false), ('Pec Deck Machine', 'Chest', false), ('Landmine Press', 'Chest', false),
('Deadlift', 'Back', false), ('Pull-Ups', 'Back', false), ('Lat Pulldown', 'Back', false), ('Seated Cable Row', 'Back', false), ('Bent Over Row', 'Back', false), ('T-Bar Row', 'Back', false), ('Single Arm Dumbbell Row', 'Back', false), ('Face Pulls', 'Back', false), ('Hyperextensions', 'Back', false), ('Shrugs', 'Back', false),
('Overhead Press', 'Shoulders', false), ('Dumbbell Shoulder Press', 'Shoulders', false), ('Lateral Raises', 'Shoulders', false), ('Front Raises', 'Shoulders', false), ('Rear Delt Flyes', 'Shoulders', false), ('Arnold Press', 'Shoulders', false), ('Upright Row', 'Shoulders', false), ('Cable Lateral Raise', 'Shoulders', false),
('Barbell Curl', 'Biceps', false), ('Dumbbell Curl', 'Biceps', false), ('Hammer Curl', 'Biceps', false), ('Preacher Curl', 'Biceps', false), ('Concentration Curl', 'Biceps', false), ('Cable Curl', 'Biceps', false), ('Incline Dumbbell Curl', 'Biceps', false), ('Spider Curl', 'Biceps', false),
('Tricep Pushdown', 'Triceps', false), ('Skull Crushers', 'Triceps', false), ('Close Grip Bench Press', 'Triceps', false), ('Overhead Tricep Extension', 'Triceps', false), ('Dips', 'Triceps', false), ('Diamond Push-Ups', 'Triceps', false), ('Cable Kickback', 'Triceps', false),
('Squat', 'Legs', false), ('Leg Press', 'Legs', false), ('Romanian Deadlift', 'Legs', false), ('Leg Extension', 'Legs', false), ('Leg Curl', 'Legs', false), ('Hack Squat', 'Legs', false), ('Bulgarian Split Squat', 'Legs', false), ('Calf Raises', 'Legs', false), ('Lunges', 'Legs', false), ('Sumo Deadlift', 'Legs', false), ('Hip Thrust', 'Legs', false), ('Glute Bridge', 'Legs', false), ('Step-Ups', 'Legs', false),
('Plank', 'Core', false), ('Crunches', 'Core', false), ('Russian Twist', 'Core', false), ('Leg Raises', 'Core', false), ('Cable Crunch', 'Core', false), ('Ab Wheel Rollout', 'Core', false), ('Hanging Knee Raise', 'Core', false), ('Side Plank', 'Core', false), ('Mountain Climbers', 'Core', false),
('Treadmill', 'Cardio', false), ('Cycling', 'Cardio', false), ('Rowing Machine', 'Cardio', false), ('Stair Climber', 'Cardio', false), ('Jump Rope', 'Cardio', false), ('HIIT', 'Cardio', false), ('Battle Ropes', 'Cardio', false), ('Swimming', 'Cardio', false), ('Elliptical', 'Cardio', false);

-- Triggers for automatic profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, unit_preference, body_weight_unit)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'lbs', 'lbs');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- User Dashboard Layout
CREATE TABLE public.user_dashboard_layout (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_dashboard_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dashboard layout" ON public.user_dashboard_layout FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own dashboard layout" ON public.user_dashboard_layout FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own dashboard layout" ON public.user_dashboard_layout FOR UPDATE USING (auth.uid() = user_id);

-- Integrity constraints and indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS start_workout_enabled BOOLEAN DEFAULT false NOT NULL;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_start_sheet BOOLEAN DEFAULT false NOT NULL;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS body_weight DOUBLE PRECISION;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS body_weight_unit TEXT DEFAULT 'kg';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height_feet INTEGER;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height_inches INTEGER;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exercises') THEN
    ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS muscle_group TEXT;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'template_exercises') THEN
    ALTER TABLE public.template_exercises ADD COLUMN IF NOT EXISTS muscle_group TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workouts_duration_minutes_check'
  ) THEN
    ALTER TABLE public.workouts
      ADD CONSTRAINT workouts_duration_minutes_check
      CHECK (duration_minutes IS NULL OR duration_minutes >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_sets_positive_check'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_sets_positive_check
      CHECK (sets > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_reps_positive_check'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_reps_positive_check
      CHECK (reps > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_weight_non_negative_check'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_weight_non_negative_check
      CHECK (weight >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_exercises_default_sets_positive_check'
  ) THEN
    ALTER TABLE public.template_exercises
      ADD CONSTRAINT template_exercises_default_sets_positive_check
      CHECK (default_sets > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_exercises_default_reps_positive_check'
  ) THEN
    ALTER TABLE public.template_exercises
      ADD CONSTRAINT template_exercises_default_reps_positive_check
      CHECK (default_reps > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_exercises_default_weight_non_negative_check'
  ) THEN
    ALTER TABLE public.template_exercises
      ADD CONSTRAINT template_exercises_default_weight_non_negative_check
      CHECK (default_weight >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'body_weight_logs_weight_positive_check'
  ) THEN
    ALTER TABLE public.body_weight_logs
      ADD CONSTRAINT body_weight_logs_weight_positive_check
      CHECK (weight > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personal_records_best_weight_non_negative_check'
  ) THEN
    ALTER TABLE public.personal_records
      ADD CONSTRAINT personal_records_best_weight_non_negative_check
      CHECK (best_weight >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personal_records_best_reps_positive_check'
  ) THEN
    ALTER TABLE public.personal_records
      ADD CONSTRAINT personal_records_best_reps_positive_check
      CHECK (best_reps > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rest_timer_preferences_default_duration_positive_check'
  ) THEN
    ALTER TABLE public.rest_timer_preferences
      ADD CONSTRAINT rest_timer_preferences_default_duration_positive_check
      CHECK (default_duration_seconds > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'body_weight_logs_user_date_key'
  ) THEN
    ALTER TABLE public.body_weight_logs
      ADD CONSTRAINT body_weight_logs_user_date_key
      UNIQUE (user_id, date);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'template_exercises_template_order_key'
  ) THEN
    ALTER TABLE public.template_exercises
      ADD CONSTRAINT template_exercises_template_order_key
      UNIQUE (template_id, order_index);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exercises_workout_order_key'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_workout_order_key
      UNIQUE (workout_id, order_index);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personal_records_user_exercise_name_key'
  ) THEN
    ALTER TABLE public.personal_records
      ADD CONSTRAINT personal_records_user_exercise_name_key
      UNIQUE (user_id, exercise_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'heart_rate_samples_bpm_positive_check'
  ) THEN
    ALTER TABLE public.heart_rate_samples
      ADD CONSTRAINT heart_rate_samples_bpm_positive_check
      CHECK (bpm > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'heart_rate_samples_ts_positive_check'
  ) THEN
    ALTER TABLE public.heart_rate_samples
      ADD CONSTRAINT heart_rate_samples_ts_positive_check
      CHECK (ts > 0);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_default_name_key
  ON public.exercise_library (lower(name))
  WHERE is_custom = false;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_custom_user_name_key
  ON public.exercise_library (user_id, lower(name))
  WHERE is_custom = true;

CREATE INDEX IF NOT EXISTS workouts_user_date_idx
  ON public.workouts (user_id, date DESC);

CREATE INDEX IF NOT EXISTS exercises_workout_order_idx
  ON public.exercises (workout_id, order_index);

CREATE INDEX IF NOT EXISTS body_weight_logs_user_date_idx
  ON public.body_weight_logs (user_id, date DESC);

CREATE INDEX IF NOT EXISTS personal_records_user_exercise_idx
  ON public.personal_records (user_id, exercise_name);

CREATE INDEX IF NOT EXISTS exercise_library_muscle_group_name_idx
  ON public.exercise_library (muscle_group, name);

CREATE INDEX IF NOT EXISTS heart_rate_sessions_user_connected_idx
  ON public.heart_rate_sessions (user_id, connected_at DESC);

CREATE INDEX IF NOT EXISTS heart_rate_samples_user_ts_idx
  ON public.heart_rate_samples (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS heart_rate_samples_session_ts_idx
  ON public.heart_rate_samples (session_id, ts);

CREATE INDEX IF NOT EXISTS exercise_goals_user_status_idx
  ON public.exercise_goals (user_id, status);

-- Backend RPC helpers
CREATE OR REPLACE FUNCTION public.save_workout_with_sets(
  p_title TEXT,
  p_workout_date DATE,
  p_duration_minutes INTEGER,
  p_notes TEXT,
  p_exercises JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workout_id UUID;
  v_muscle_groups TEXT[];
  v_exercise JSONB;
  v_set JSONB;
  v_order_index INTEGER := 0;
  v_exercise_name TEXT;
  v_exercise_muscle_group TEXT;
  v_exercise_db_id TEXT;
  v_reps INTEGER;
  v_weight DOUBLE PRECISION;
  v_unit TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Workout title is required';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' OR jsonb_array_length(p_exercises) = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT muscle_group), ARRAY[]::TEXT[])
  INTO v_muscle_groups
  FROM (
    SELECT NULLIF(btrim(item->>'muscle_group'), '') AS muscle_group
    FROM jsonb_array_elements(p_exercises) AS item
  ) grouped
  WHERE muscle_group IS NOT NULL;

  INSERT INTO public.workouts (
    user_id,
    title,
    date,
    duration_minutes,
    notes,
    muscle_groups
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    p_workout_date,
    GREATEST(COALESCE(p_duration_minutes, 0), 0),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    v_muscle_groups
  )
  RETURNING id INTO v_workout_id;

  FOR v_exercise IN
    SELECT value
    FROM jsonb_array_elements(p_exercises)
  LOOP
    v_exercise_name := NULLIF(btrim(v_exercise->>'name'), '');
    v_exercise_muscle_group := NULLIF(btrim(v_exercise->>'muscle_group'), '');
    v_exercise_db_id := NULLIF(v_exercise->>'exercise_db_id', '');

    IF v_exercise_name IS NULL THEN
      RAISE EXCEPTION 'Exercise name is required';
    END IF;

    FOR v_set IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(v_exercise->'completed_sets', '[]'::jsonb))
    LOOP
      v_reps := GREATEST(COALESCE((v_set->>'reps')::INTEGER, 0), 0);
      v_weight := GREATEST(COALESCE((v_set->>'weight')::DOUBLE PRECISION, 0), 0);
      v_unit := lower(COALESCE(NULLIF(v_set->>'unit', ''), 'kg'));

      IF v_unit NOT IN ('kg', 'lbs', 'km', 'mi') THEN
        v_unit := 'kg';
      END IF;

      IF v_reps <= 0 AND v_weight <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.exercises (
        workout_id,
        name,
        muscle_group,
        sets,
        reps,
        weight,
        unit,
        order_index,
        exercise_db_id
      )
      VALUES (
        v_workout_id,
        v_exercise_name,
        v_exercise_muscle_group,
        1,
        v_reps,
        v_weight,
        v_unit,
        v_order_index,
        v_exercise_db_id
      );

      INSERT INTO public.personal_records (
        user_id,
        exercise_name,
        best_weight,
        best_reps,
        achieved_date,
        exercise_db_id
      )
      VALUES (
        v_user_id,
        v_exercise_name,
        v_weight,
        v_reps,
        p_workout_date,
        v_exercise_db_id
      )
      ON CONFLICT (user_id, exercise_name) DO UPDATE
      SET best_weight = EXCLUDED.best_weight,
          best_reps = EXCLUDED.best_reps,
          achieved_date = EXCLUDED.achieved_date,
          exercise_db_id = COALESCE(EXCLUDED.exercise_db_id, public.personal_records.exercise_db_id)
      WHERE EXCLUDED.best_weight > public.personal_records.best_weight
         OR (
           EXCLUDED.best_weight = public.personal_records.best_weight
           AND EXCLUDED.best_reps > public.personal_records.best_reps
         );

      v_order_index := v_order_index + 1;
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_template_with_exercises(
  p_template_id UUID,
  p_title TEXT,
  p_exercises JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_template_id UUID;
  v_exercise JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Template title is required';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' OR jsonb_array_length(p_exercises) = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  IF p_template_id IS NULL THEN
    INSERT INTO public.templates (user_id, title)
    VALUES (v_user_id, btrim(p_title))
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE public.templates
    SET title = btrim(p_title)
    WHERE id = p_template_id
      AND user_id = v_user_id
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'Template not found';
    END IF;

    DELETE FROM public.template_exercises
    WHERE template_id = v_template_id;
  END IF;

  FOR v_exercise IN
    SELECT value
    FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.template_exercises (
      template_id,
      name,
      muscle_group,
      default_sets,
      default_reps,
      default_weight,
      order_index,
      exercise_db_id
    )
    VALUES (
      v_template_id,
      btrim(v_exercise->>'name'),
      NULLIF(btrim(v_exercise->>'muscle_group'), ''),
      GREATEST(COALESCE((v_exercise->>'default_sets')::INTEGER, 0), 1),
      GREATEST(COALESCE((v_exercise->>'default_reps')::INTEGER, 0), 1),
      GREATEST(COALESCE((v_exercise->>'default_weight')::DOUBLE PRECISION, 0), 0),
      COALESCE((v_exercise->>'order_index')::INTEGER, 0),
      NULLIF(v_exercise->>'exercise_db_id', '')
    );
  END LOOP;

  RETURN v_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_body_weight(
  p_date DATE,
  p_weight DOUBLE PRECISION,
  p_unit TEXT DEFAULT 'lbs',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_log_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_weight IS NULL OR p_weight <= 0 THEN
    RAISE EXCEPTION 'Weight must be greater than zero';
  END IF;

  INSERT INTO public.body_weight_logs (
    user_id,
    date,
    weight,
    unit,
    notes
  )
  VALUES (
    v_user_id,
    p_date,
    p_weight,
    COALESCE(NULLIF(p_unit, ''), 'kg'),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  ON CONFLICT (user_id, date) DO UPDATE
  SET weight = EXCLUDED.weight,
      unit = EXCLUDED.unit,
      notes = EXCLUDED.notes
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_workout_with_sets(TEXT, DATE, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_template_with_exercises(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_body_weight(DATE, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;

-- AI Coach Keys (server-side Gemini API key storage per user)
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
