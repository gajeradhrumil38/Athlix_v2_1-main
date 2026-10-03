-- Checks migration 20261002010000 in the Supabase SQL Editor. Acts as the
-- trainee of the first accepted coach link, then ABORTS on purpose: results
-- arrive as the error message and nothing is saved. "BAD" = failure.
CREATE TEMP TABLE _r (n serial, test text, outcome text);
GRANT ALL ON _r TO authenticated;
GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
DO $$
DECLARE l record; plan_id uuid; w uuid; foreign_plan uuid := gen_random_uuid();
BEGIN
  SELECT * INTO l FROM public.coach_links WHERE status = 'accepted' LIMIT 1;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Needs one accepted coach link'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', l.trainer_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.assigned_plans (trainer_id, trainee_id, title) VALUES (l.trainer_id, l.trainee_id, 'zz plan') RETURNING id INTO plan_id;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', l.trainee_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb, plan_id, null, 'Push');
  INSERT INTO _r(test, outcome) SELECT 'valid plan + day stored (want plan/Push)',
    format('%s/%s', CASE WHEN source_plan_id = plan_id THEN 'plan' ELSE 'BAD' END, coalesce(source_plan_day, 'NULL')) FROM public.workouts WHERE id = w;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb, foreign_plan, null, 'Push');
  INSERT INTO _r(test, outcome) SELECT 'foreign plan dropped (want NULL/NULL)',
    format('%s/%s', coalesce(source_plan_id::text, 'NULL'), coalesce(source_plan_day, 'NULL')) FROM public.workouts WHERE id = w;
  w := public.save_workout_with_sets('zz', current_date, 30, null,
        '[{"name":"Bench Press","completed_sets":[{"reps":5,"weight":100,"unit":"lbs"}]}]'::jsonb);
  INSERT INTO _r(test, outcome) SELECT 'old 5-arg call still works (want NULL)', coalesce(source_plan_day, 'NULL') FROM public.workouts WHERE id = w;
  RESET ROLE;
END $$;
DO $$ BEGIN
  RAISE EXCEPTION E'TEST RESULTS (aborted on purpose, nothing saved):\n%', (SELECT string_agg(n || '. ' || test || ' => ' || outcome, E'\n' ORDER BY n) FROM _r);
END $$;
