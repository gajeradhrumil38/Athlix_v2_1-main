-- Deterministic training recommendation V1.
-- Stores the daily athlete context used by the scorer plus the final
-- explainable recommendation shown on Home.

create table if not exists public.athlete_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  generated_at timestamptz not null default now(),
  readiness jsonb not null default '{}'::jsonb,
  training_load jsonb not null default '{}'::jsonb,
  muscle_state jsonb not null default '{}'::jsonb,
  gym jsonb not null default '{}'::jsonb,
  whoop jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  model_version text not null default 'deterministic-v1',
  unique (user_id, date)
);

create table if not exists public.training_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  snapshot_id uuid references public.athlete_daily_snapshots(id) on delete set null,
  title text not null,
  recommendation_type text not null check (
    recommendation_type in ('push', 'pull', 'legs', 'upper', 'core', 'cardio', 'mobility', 'rest')
  ),
  intensity text not null check (intensity in ('heavy', 'moderate', 'light', 'recovery', 'rest')),
  readiness_tier text not null check (readiness_tier in ('green', 'yellow', 'red', 'unknown')),
  muscles text[] not null default array[]::text[],
  exercises jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  alternatives jsonb not null default '[]'::jsonb,
  score numeric not null default 0,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  generated_at timestamptz not null default now(),
  model_version text not null default 'deterministic-v1',
  unique (user_id, date)
);

create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid references public.training_recommendations(id) on delete set null,
  date date not null default current_date,
  action text not null check (action in ('accepted', 'modified', 'skipped', 'completed')),
  chosen_muscles text[] not null default array[]::text[],
  completed_workout_id uuid references public.workouts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.athlete_daily_snapshots enable row level security;
alter table public.training_recommendations enable row level security;
alter table public.recommendation_feedback enable row level security;

create policy "snapshots_select_own"
on public.athlete_daily_snapshots for select
using (auth.uid() = user_id);

create policy "recommendations_select_own"
on public.training_recommendations for select
using (auth.uid() = user_id);

create policy "feedback_select_own"
on public.recommendation_feedback for select
using (auth.uid() = user_id);

create policy "feedback_insert_own"
on public.recommendation_feedback for insert
with check (auth.uid() = user_id);

create policy "feedback_update_own"
on public.recommendation_feedback for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists athlete_daily_snapshots_user_date_idx
  on public.athlete_daily_snapshots (user_id, date desc);

create index if not exists training_recommendations_user_date_idx
  on public.training_recommendations (user_id, date desc);

create index if not exists recommendation_feedback_user_date_idx
  on public.recommendation_feedback (user_id, date desc);
