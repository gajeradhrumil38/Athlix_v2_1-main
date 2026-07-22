CREATE TABLE IF NOT EXISTS public.exercise_type_overrides (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  input_type TEXT NOT NULL CHECK (input_type IN ('weight_reps', 'reps_only', 'time_only', 'distance_only')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, exercise_name)
);

ALTER TABLE public.exercise_type_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exercise type overrides" ON public.exercise_type_overrides
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own exercise type overrides" ON public.exercise_type_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exercise type overrides" ON public.exercise_type_overrides
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exercise type overrides" ON public.exercise_type_overrides
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.exercise_type_overrides IS
  'Per-user override of an exercise''s input type (weight/reps/time/distance), keyed by normalized (lowercased, trimmed) exercise name. Takes precedence over resolveExerciseInputType()''s name-based classification.';
