-- Make the n8n vector-store node return REAL data without embeddings.
-- The node requires a `documents` table + `match_documents(query_embedding,
-- match_count, filter)`. We don't do semantic search: match_documents IGNORES
-- the embedding and returns the athlete's live training context (from
-- athlix_agent_context) as a single document. So "searching the store" always
-- returns up-to-date real logs.
--
-- User resolution: explicit filter.user_id → the JWT caller's own id → (service
-- role / single-user demo) the most-active account.

create extension if not exists vector;

create table if not exists public.documents (
  id        bigserial primary key,
  content   text,
  metadata  jsonb,
  embedding vector(1536)
);

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int default null,
  filter jsonb default '{}'::jsonb
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := nullif(filter->>'user_id', '')::uuid;
  if v_user is null then
    v_user := auth.uid();
  end if;
  if v_user is null then
    select user_id into v_user from workouts group by user_id order by count(*) desc limit 1;
  end if;

  return query
  select 1::bigint,
         public.athlix_agent_context(v_user),
         jsonb_build_object('type', 'athlix_context', 'user_id', v_user),
         1.0::float;
end;
$$;

grant execute on function public.match_documents(vector, int, jsonb) to authenticated, service_role;
