-- Persisted WHOOP activities (per-workout strain, HR, energy, distance) so the
-- app shows activity history without reopening the WHOOP app, and so the
-- per-exercise strain-cost model (personalized-v2) has training data.
create table if not exists public.whoop_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whoop_id bigint not null,
  date date not null,
  sport_id integer,
  sport_name text,
  started_at timestamptz,
  ended_at timestamptz,
  strain numeric,
  average_heart_rate integer,
  max_heart_rate integer,
  kilojoules numeric,
  distance_meter numeric,
  zones jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, whoop_id)
);

alter table public.whoop_activities enable row level security;

create policy "whoop_activities_select_own"
on public.whoop_activities for select
using (auth.uid() = user_id);

create index if not exists whoop_activities_user_date_idx
  on public.whoop_activities (user_id, date desc);
