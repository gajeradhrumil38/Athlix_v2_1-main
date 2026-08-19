import { format } from 'date-fns';
import { supabase } from './supabase';

// Durable chat-session history for the AI coach. A "session" is one day's
// conversation. Stored in the CLOUD (public.coach_chat_sessions, one row per
// session) so it follows the user across devices and is never kept on-device.
// The client holds only an in-memory cache (source of truth is Supabase);
// loadSessions() hydrates it on chat open and every write upserts to the cloud.
// All cloud calls degrade gracefully — if the table is unreachable the coach
// still works with in-memory sessions for the current app session.
//
// Messages are stored loosely (StoredChatMessage) to avoid a circular import
// with the AiChat Message type — the component casts on the way in and out.

export interface StoredChatMessage {
  role: string;
  text: string;
  [k: string]: unknown;
}

export interface ChatSession {
  id: string;          // unique per session
  date: string;        // yyyy-MM-dd it started
  title: string;       // subject line — the first user message, trimmed
  messages: StoredChatMessage[];
  updatedAt: string;   // ISO
}

const MAX_SESSIONS = 40;
const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ── In-memory cache (no on-device persistence) ─────────────────────
let cache: ChatSession[] = [];
let cacheUid: string | null = null;
let activeId: string | null = null;

export function deriveTitle(messages: StoredChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && String(m.text || '').trim());
  const raw = (firstUser?.text as string) || '';
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 46 ? `${clean.slice(0, 46)}…` : clean;
}

// Hydrate the cache from the cloud. Call once when the chat opens.
export async function loadSessions(uid?: string | null): Promise<ChatSession[]> {
  if (!uid) { cache = []; cacheUid = null; activeId = null; return []; }
  cacheUid = uid;
  try {
    const { data } = await supabase
      .from('coach_chat_sessions')
      .select('session_id, date, title, messages, updated_at')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(MAX_SESSIONS);
    cache = (data ?? []).map((r) => {
      const row = r as { session_id: string; date: string; title: string; messages: unknown; updated_at: string };
      return {
        id: row.session_id,
        date: row.date,
        title: row.title,
        messages: Array.isArray(row.messages) ? (row.messages as StoredChatMessage[]) : [],
        updatedAt: row.updated_at,
      };
    });
  } catch {
    // Table missing / offline — operate in-memory for this app session.
  }
  return cache;
}

export function getSessions(uid?: string | null): ChatSession[] {
  if (uid && cacheUid && uid !== cacheUid) return [];
  return cache;
}

export function setActiveSession(_uid: string | null | undefined, id: string) {
  activeId = id;
}

// The session to show right now. If the active one is missing or from an
// earlier day, a fresh empty session for today is created and made active.
export function resolveActiveSession(_uid?: string | null): ChatSession {
  const active = cache.find((s) => s.id === activeId);
  if (active && active.date === todayIso()) return active;
  const fresh: ChatSession = { id: newId(), date: todayIso(), title: 'New chat', messages: [], updatedAt: new Date().toISOString() };
  cache = [fresh, ...cache].slice(0, MAX_SESSIONS);
  activeId = fresh.id;
  return fresh;
}

// Force a brand-new session (the "New chat" action), even mid-day.
export function startFreshSession(_uid?: string | null): ChatSession {
  cache = cache.filter((s) => s.messages.length > 0); // drop empty leftovers
  const fresh: ChatSession = { id: newId(), date: todayIso(), title: 'New chat', messages: [], updatedAt: new Date().toISOString() };
  cache = [fresh, ...cache].slice(0, MAX_SESSIONS);
  activeId = fresh.id;
  return fresh;
}

// Persist the active session's messages: update the cache and upsert to cloud.
export function persistActiveMessages(uid: string | null | undefined, id: string, messages: StoredChatMessage[]) {
  const existing = cache.find((s) => s.id === id);
  const updated: ChatSession = {
    id,
    date: existing?.date || todayIso(),
    title: deriveTitle(messages),
    messages,
    updatedAt: new Date().toISOString(),
  };
  cache = [updated, ...cache.filter((s) => s.id !== id)].slice(0, MAX_SESSIONS);
  if (!uid) return;
  supabase
    .from('coach_chat_sessions')
    .upsert(
      { user_id: uid, session_id: id, date: updated.date, title: updated.title, messages, updated_at: updated.updatedAt },
      { onConflict: 'user_id,session_id' },
    )
    .then(() => {}, () => {}); // fire-and-forget; failures are non-fatal
}

export function deleteSession(uid: string | null | undefined, id: string) {
  cache = cache.filter((s) => s.id !== id);
  if (activeId === id) activeId = null;
  if (!uid) return;
  supabase.from('coach_chat_sessions').delete().eq('user_id', uid).eq('session_id', id).then(() => {}, () => {});
}
