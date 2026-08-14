-- Per-user learned model parameters (personalized-v2). One row per model per
-- user; refit daily by the training-recommendation edge function.
create table if not exists public.user_training_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,                        -- 'strain_cost' | (later) 'recovery_response' | 'preference'
  model_version text not null default 'personalized-v2',
  coefficients jsonb not null default '{}'::jsonb,  -- learned params (e.g. {intercept, perSet, perVolK})
  n_samples integer not null default 0,
  quality jsonb not null default '{}'::jsonb,        -- {r2, mae, blendWeight, fromCyclePairs}
  updated_at timestamptz not null default now(),
  unique (user_id, model_name)
);

alter table public.user_training_models enable row level security;

create policy "user_training_models_select_own"
on public.user_training_models for select
using (auth.uid() = user_id);

create index if not exists user_training_models_user_idx
  on public.user_training_models (user_id, model_name);
