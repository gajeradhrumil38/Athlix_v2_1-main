-- Run in Supabase SQL editor to ensure authenticated users can read their own rows.

alter table if exists public.profiles enable row level security;
alter table if exists public.workouts enable row level security;
alter table if exists public.exercises enable row level security;
alter table if exists public.templates enable row level security;
alter table if exists public.template_exercises enable row level security;
alter table if exists public.body_weight_logs enable row level security;
alter table if exists public.personal_records enable row level security;

-- Profiles: owner is auth.uid() = id
create policy if not exists "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy if not exists "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy if not exists "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Generic user-owned tables with user_id
create policy if not exists "workouts_all_own"
on public.workouts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "templates_all_own"
on public.templates for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "body_weight_logs_all_own"
on public.body_weight_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "personal_records_all_own"
on public.personal_records for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Child tables that reference parent ownership
create policy if not exists "exercises_all_own"
on public.exercises for all
using (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workouts w
    where w.id = exercises.workout_id
      and w.user_id = auth.uid()
  )
);

create policy if not exists "template_exercises_all_own"
on public.template_exercises for all
using (
  exists (
    select 1
    from public.templates t
    where t.id = template_exercises.template_id
      and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.templates t
    where t.id = template_exercises.template_id
      and t.user_id = auth.uid()
  )
);

-- If you need public read on a table, policy example:
-- create policy "public_read_example" on public.some_table for select using (true);
