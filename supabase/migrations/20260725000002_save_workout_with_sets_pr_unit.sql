-- Update save_workout_with_sets() to store the set's unit alongside each
-- personal_records upsert (now that personal_records has a unit column),
-- and to only write personal_records for weight-based sets (kg/lbs) —
-- previously it wrote unconditionally, including for distance-based
-- (km/mi) exercises, which no longer satisfies the unit CHECK constraint.
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

      -- Only weight-based sets (kg/lbs) feed personal_records — the table's
      -- unit column is constrained to kg/lbs, and a distance-based "best"
      -- (km/mi) isn't a meaningful strength PR anyway.
      IF v_unit IN ('kg', 'lbs') THEN
        INSERT INTO public.personal_records (
          user_id,
          exercise_name,
          best_weight,
          best_reps,
          achieved_date,
          exercise_db_id,
          unit
        )
        VALUES (
          v_user_id,
          v_exercise_name,
          v_weight,
          v_reps,
          p_workout_date,
          v_exercise_db_id,
          v_unit
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
$$;
