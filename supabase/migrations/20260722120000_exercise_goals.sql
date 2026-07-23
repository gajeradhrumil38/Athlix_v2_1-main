CREATE TABLE IF NOT EXISTS public.exercise_goals (
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

ALTER TABLE public.exercise_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exercise goals" ON public.exercise_goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own exercise goals" ON public.exercise_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exercise goals" ON public.exercise_goals
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exercise goals" ON public.exercise_goals
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX exercise_goals_user_status_idx ON public.exercise_goals (user_id, status);

COMMENT ON TABLE public.exercise_goals IS
  'Per-user strength target for a specific exercise, e.g. "Bench Press -> 100kg x 5". Met when a logged set reaches target_weight for target_reps or more.';
