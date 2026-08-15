-- Daily data-driven insights bundle (recovery forecast, sleep debt, optimal
-- strain target, overreaching early-warning) computed by the edge function.
alter table public.athlete_daily_snapshots
  add column if not exists insights jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
