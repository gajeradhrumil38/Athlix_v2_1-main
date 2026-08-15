-- The personalized-v2 recovery dose-response model writes its "how your
-- recovery responds to strain + sleep" insight onto the daily snapshot.
alter table public.athlete_daily_snapshots
  add column if not exists recovery_insight jsonb;

notify pgrst, 'reload schema';
