-- Cross-device AI-coach chat history. Moves the coach's conversation sessions
-- off localStorage into the cloud so they follow the user across devices and
-- aren't stored on-device. One row per session; the client keeps an in-memory
-- cache for instant reads and upserts here (last-write-wins on updated_at).
create table if not exists public.coach_chat_sessions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  date       date not null,
  title      text not null default 'New chat',
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.coach_chat_sessions enable row level security;

drop policy if exists coach_chat_sessions_select_own on public.coach_chat_sessions;
create policy coach_chat_sessions_select_own on public.coach_chat_sessions
  for select using (auth.uid() = user_id);

drop policy if exists coach_chat_sessions_insert_own on public.coach_chat_sessions;
create policy coach_chat_sessions_insert_own on public.coach_chat_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists coach_chat_sessions_update_own on public.coach_chat_sessions;
create policy coach_chat_sessions_update_own on public.coach_chat_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists coach_chat_sessions_delete_own on public.coach_chat_sessions;
create policy coach_chat_sessions_delete_own on public.coach_chat_sessions
  for delete using (auth.uid() = user_id);

create index if not exists coach_chat_sessions_user_updated_idx
  on public.coach_chat_sessions (user_id, updated_at desc);
