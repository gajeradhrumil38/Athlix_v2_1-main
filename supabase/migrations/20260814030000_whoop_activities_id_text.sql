-- WHOOP v2 workout IDs are UUID strings (e.g. 2351b61a-…), not integers, so the
-- bigint whoop_id rejected every activity and the sync wrote nothing. Store the
-- id as text. Safe: the table is empty (the bug meant nothing ever inserted).
alter table public.whoop_activities
  alter column whoop_id type text using whoop_id::text;

notify pgrst, 'reload schema';
