-- athlix_agent_context(user_id): returns the athlete's full training context as
-- a single readable text block — this week's sessions + sets by muscle, recent
-- sessions, recent sets, personal records, and latest body weight. Built so an
-- external agent (n8n) can answer from real logs with ONE tool call instead of
-- querying/joining tables itself.
--
-- SECURITY DEFINER so it works with the service role (auth.uid() is null) or the
-- user's own JWT; a JWT user may only read their own context (guard below).

create or replace function public.athlix_agent_context(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_unit text;
  v_out  text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  select full_name, unit_preference into v_name, v_unit
  from profiles where id = p_user_id;

  v_out := 'ATHLETE: ' || coalesce(v_name, 'Athlete')
        || ' | unit: ' || coalesce(v_unit, 'lbs')
        || ' | today: ' || to_char(current_date, 'YYYY-MM-DD') || E'\n';

  v_out := v_out || E'\nTHIS WEEK (last 7 days):' || E'\n'
        || '  Sessions: ' || (select count(*) from workouts
             where user_id = p_user_id and date >= current_date - 6)::text || E'\n'
        || '  Sets by muscle: ' || coalesce((
             select string_agg(muscle || ' ' || cnt::text, ', ' order by cnt desc)
             from (
               select coalesce(e.muscle_group, 'Other') as muscle, count(*) as cnt
               from exercises e join workouts w on w.id = e.workout_id
               where w.user_id = p_user_id and w.date >= current_date - 6
               group by coalesce(e.muscle_group, 'Other')
             ) s), 'none logged');

  v_out := v_out || E'\n\nRECENT SESSIONS:' || E'\n'
        || coalesce((
             select string_agg('  ' || to_char(w.date, 'YYYY-MM-DD') || ' — ' || w.title
                    || coalesce(' [' || array_to_string(w.muscle_groups, ', ') || ']', ''),
                    E'\n' order by w.date desc)
             from (select * from workouts where user_id = p_user_id order by date desc limit 15) w
           ), '  none');

  v_out := v_out || E'\n\nRECENT SETS (newest first):' || E'\n'
        || coalesce((
             select string_agg(line, E'\n')
             from (
               select '  ' || to_char(w.date, 'MM-DD') || ' ' || e.name || ': '
                      || e.weight::text || e.unit || ' x ' || e.reps::text as line
               from exercises e join workouts w on w.id = e.workout_id
               where w.user_id = p_user_id
               order by w.date desc, e.order_index limit 60
             ) t), '  none');

  v_out := v_out || E'\n\nPERSONAL RECORDS:' || E'\n'
        || coalesce((
             select string_agg('  ' || exercise_name || ': ' || best_weight::text
                    || coalesce(unit, v_unit, 'lbs') || ' x ' || best_reps::text
                    || ' (' || achieved_date::text || ')', E'\n' order by achieved_date desc)
             from (select * from personal_records where user_id = p_user_id
                   order by achieved_date desc limit 25) p), '  none');

  v_out := v_out || E'\n\nBODY WEIGHT: ' || coalesce((
             select weight::text || ' ' || unit || ' (' || date::text || ')'
             from body_weight_logs where user_id = p_user_id order by date desc limit 1
           ), 'not logged');

  return v_out;
end;
$$;

grant execute on function public.athlix_agent_context(uuid) to authenticated, service_role;
