-- Root-caused via a full backend audit: 31 workouts in the live table had
-- zero exercise rows attached -- title and date intact, but completely
-- empty. The client-side updateWorkoutSets() (used by Calendar.tsx's set
-- editor and its "merge workouts" feature) did this as three separate
-- network calls: DELETE all existing exercises, then INSERT the
-- replacements in chunks, then UPDATE the workout's muscle_groups. If
-- anything failed after the DELETE but before every INSERT chunk landed
-- (a network blip, a validation error on one row, the tab closing
-- mid-request), the workout was left permanently empty -- there was no
-- transaction tying the delete and the inserts together. Wrapping the
-- whole replace in one RPC makes it atomic: Postgres runs a function body
-- as a single transaction, so a RAISE EXCEPTION anywhere rolls back the
-- DELETE along with everything after it, instead of leaving a torn state.
CREATE OR REPLACE FUNCTION public.update_workout_sets(
  p_workout_id UUID,
  p_exercises JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_owned BOOLEAN;
  v_exercise JSONB;
  v_set JSONB;
  v_order_index INTEGER := 0;
  v_exercise_name TEXT;
  v_exercise_muscle_group TEXT;
  v_exercise_db_id TEXT;
  v_reps INTEGER;
  v_weight DOUBLE PRECISION;
  v_unit TEXT;
  v_muscle_groups TEXT[];
  v_any_set BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.workouts WHERE id = p_workout_id AND user_id = v_user_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'Workout not found';
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

  -- Everything from here on is inside this function's single implicit
  -- transaction -- the DELETE and every INSERT either all land or all
  -- roll back together.
  DELETE FROM public.exercises WHERE workout_id = p_workout_id;

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
        p_workout_id, v_exercise_name, v_exercise_muscle_group, 1, v_reps, v_weight, v_unit, v_order_index, v_exercise_db_id
      );

      v_order_index := v_order_index + 1;
      v_any_set := true;
    END LOOP;
  END LOOP;

  -- No valid set survived filtering (e.g. every set was 0/0) -- abort
  -- before committing, same guard the old client-side code had, just
  -- enforced inside the same transaction as the delete now.
  IF NOT v_any_set THEN
    RAISE EXCEPTION 'Keep at least one set, or delete the workout instead.';
  END IF;

  UPDATE public.workouts
  SET muscle_groups = v_muscle_groups
  WHERE id = p_workout_id AND user_id = v_user_id;
END;
$$;
