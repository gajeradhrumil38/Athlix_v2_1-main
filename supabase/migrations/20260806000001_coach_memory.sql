-- Cross-device memory for the AI coach: goals, durable facts (schedule /
-- constraints / preferences), and daily check-ins. One row per user; the client
-- keeps a localStorage mirror for instant/offline reads and syncs last-write-wins.

create table if not exists public.coach_memory (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  goals      jsonb not null default '[]'::jsonb,
  facts      jsonb not null default '[]'::jsonb,
  check_ins  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coach_memory enable row level security;

drop policy if exists coach_memory_select_own on public.coach_memory;
create policy coach_memory_select_own on public.coach_memory
  for select using (auth.uid() = user_id);

drop policy if exists coach_memory_insert_own on public.coach_memory;
create policy coach_memory_insert_own on public.coach_memory
  for insert with check (auth.uid() = user_id);

drop policy if exists coach_memory_update_own on public.coach_memory;
create policy coach_memory_update_own on public.coach_memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists coach_memory_delete_own on public.coach_memory;
create policy coach_memory_delete_own on public.coach_memory
  for delete using (auth.uid() = user_id);
