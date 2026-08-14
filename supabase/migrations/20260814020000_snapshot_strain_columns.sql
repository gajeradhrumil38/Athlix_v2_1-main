-- The personalized-v2 strain-cost model writes its per-day summary and the
-- "last session cost" insight onto the daily snapshot. Add the columns the
-- edge function's snapshot upsert now includes (without them the upsert 500s).
alter table public.athlete_daily_snapshots
  add column if not exists strain_cost jsonb not null default '{}'::jsonb,
  add column if not exists strain_insight jsonb;
