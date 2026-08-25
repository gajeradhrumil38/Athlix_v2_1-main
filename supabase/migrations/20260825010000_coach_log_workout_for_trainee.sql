-- Lets a coach log a completed session on a trainee's behalf (e.g. an
-- in-person session), scoped exactly like existing coach READ access: only
-- for a trainee who has shared their 'workouts' scope with this coach.
-- Reuses the existing coach_can_see() helper (already SECURITY DEFINER,
-- already used by every coach_view_* read policy) rather than inventing a
-- new authorization path.

-- 1) Extend the existing save RPC with an optional p_trainee_id, following
--    the same "add a trailing DEFAULT NULL param" pattern already used for
--    p_source_plan_id. When set, the caller must be an authorized coach for
--    that trainee; the workout is attributed to the TRAINEE, not the coach.
--    NOTE: CREATE OR REPLACE does not change an existing function's
--    signature — adding a parameter here creates a SECOND overload unless
--    the old one is explicitly dropped first (see step 1b). Drop first,
--    then recreate, so there is never a window with two overloads.
DROP FUNCTION IF EXISTS public.save_workout_with_sets(text, date, integer, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.save_workout_with_sets(
  p_title text,
  p_workout_date date,
  p_duration_minutes integer,
  p_notes text,
  p_exercises jsonb,
  p_source_plan_id uuid DEFAULT NULL,
  p_trainee_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
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
  v_title TEXT;
  v_distinct_exercise_names INTEGER;
  v_only_exercise_name TEXT;
BEGIN
  IF p_trainee_id IS NOT NULL THEN
    IF NOT public.coach_can_see(p_trainee_id, 'workouts') THEN
      RAISE EXCEPTION 'Not authorized to log for this trainee';
    END IF;
    v_user_id := p_trainee_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'Workout title is required';
  END IF;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' OR jsonb_array_length(p_exercises) = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  v_title := btrim(p_title);

  SELECT count(DISTINCT NULLIF(btrim(item->>'name'), ''))
  INTO v_distinct_exercise_names
  FROM jsonb_array_elements(p_exercises) AS item;

  IF v_distinct_exercise_names = 1 THEN
    SELECT NULLIF(btrim(item->>'name'), '')
    INTO v_only_exercise_name
    FROM jsonb_array_elements(p_exercises) AS item
    LIMIT 1;

    IF v_only_exercise_name IS NOT NULL AND lower(v_title) = lower(v_only_exercise_name) THEN
      v_title := 'Workout';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT muscle_group), ARRAY[]::TEXT[])
  INTO v_muscle_groups
  FROM (
    SELECT NULLIF(btrim(item->>'muscle_group'), '') AS muscle_group
    FROM jsonb_array_elements(p_exercises) AS item
  ) grouped
  WHERE muscle_group IS NOT NULL;

  INSERT INTO public.workouts (
    user_id, title, date, duration_minutes, notes, muscle_groups, source_plan_id
  )
  VALUES (
    v_user_id, v_title, p_workout_date, GREATEST(COALESCE(p_duration_minutes, 0), 0),
    NULLIF(btrim(COALESCE(p_notes, '')), ''), v_muscle_groups, p_source_plan_id
  )
  RETURNING id INTO v_workout_id;

  FOR v_exercise IN
    SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    v_exercise_name := NULLIF(btrim(v_exercise->>'name'), '');
    v_exercise_muscle_group := NULLIF(btrim(v_exercise->>'muscle_group'), '');
    v_exercise_db_id := NULLIF(v_exercise->>'exercise_db_id', '');

    IF v_exercise_name IS NULL THEN
      RAISE EXCEPTION 'Exercise name is required';
    END IF;

    FOR v_set IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_exercise->'completed_sets', '[]'::jsonb))
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
        workout_id, name, muscle_group, sets, reps, weight, unit, order_index, exercise_db_id
      )
      VALUES (
        v_workout_id, v_exercise_name, v_exercise_muscle_group, 1, v_reps, v_weight, v_unit, v_order_index, v_exercise_db_id
      );

      IF v_unit IN ('kg', 'lbs') THEN
        INSERT INTO public.personal_records (
          user_id, exercise_name, best_weight, best_reps, achieved_date, exercise_db_id, unit
        )
        VALUES (
          v_user_id, v_exercise_name, v_weight, v_reps, p_workout_date, v_exercise_db_id, v_unit
        )
        ON CONFLICT (user_id, exercise_name) DO UPDATE
        SET best_weight = EXCLUDED.best_weight,
            best_reps = EXCLUDED.best_reps,
            achieved_date = EXCLUDED.achieved_date,
            exercise_db_id = COALESCE(EXCLUDED.exercise_db_id, public.personal_records.exercise_db_id),
            unit = EXCLUDED.unit
        WHERE EXCLUDED.best_weight > public.personal_records.best_weight
           OR (
             EXCLUDED.best_weight = public.personal_records.best_weight
             AND EXCLUDED.best_reps > public.personal_records.best_reps
           );
      END IF;

      v_order_index := v_order_index + 1;
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$function$;

-- 2) New RLS: a coach may INSERT (never UPDATE/DELETE) into a shared
--    trainee's workouts/exercises/personal_records. Deliberately INSERT-only
--    — a coach logging a new session is a different, much narrower
--    permission than being able to edit or delete history the trainee
--    logged themselves.
DROP POLICY IF EXISTS coach_insert_workouts ON public.workouts;
CREATE POLICY coach_insert_workouts ON public.workouts
  FOR INSERT WITH CHECK (public.coach_can_see(user_id, 'workouts'));

DROP POLICY IF EXISTS coach_insert_exercises ON public.exercises;
CREATE POLICY coach_insert_exercises ON public.exercises
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND public.coach_can_see(w.user_id, 'workouts'))
  );

DROP POLICY IF EXISTS coach_insert_prs ON public.personal_records;
CREATE POLICY coach_insert_prs ON public.personal_records
  FOR INSERT WITH CHECK (public.coach_can_see(user_id, 'workouts'));

DROP POLICY IF EXISTS coach_update_prs ON public.personal_records;
CREATE POLICY coach_update_prs ON public.personal_records
  FOR UPDATE USING (public.coach_can_see(user_id, 'workouts')) WITH CHECK (public.coach_can_see(user_id, 'workouts'));
