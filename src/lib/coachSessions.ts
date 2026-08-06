import { format } from 'date-fns';

// Durable chat-session history for the AI coach. A "session" is one day's
// conversation: opening the coach on a new day starts a fresh session, and past
// days are kept in a list so the user can scroll back through them from the
// history menu. Stored in localStorage (survives tab close / day change, unlike
// the old per-tab sessionStorage blob), keyed per user.
//
// Messages are stored loosely (StoredChatMessage) to avoid a circular import
// with the AiChat Message type — the component casts on the way in and out.

export interface StoredChatMessage {
  role: string;
  text: string;
  [k: string]: unknown;
}

export interface ChatSession {
  id: string;          // unique per session (usually the date; +suffix for extra same-day sessions)
  date: string;        // yyyy-MM-dd it started
  title: string;       // subject line — the first user message, trimmed
  messages: StoredChatMessage[];
  updatedAt: string;   // ISO
}

const MAX_SESSIONS = 40;
const listKey = (uid?: string | null) => `athlix:coach_sessions:${uid || 'anon'}`;
const activeKey = (uid?: string | null) => `athlix:coach_active:${uid || 'anon'}`;
const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function deriveTitle(messages: StoredChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && String(m.text || '').trim());
  const raw = (firstUser?.text as string) || '';
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length > 46 ? `${clean.slice(0, 46)}…` : clean;
}

export function getSessions(uid?: string | null): ChatSession[] {
  try {
    const raw = localStorage.getItem(listKey(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw) as ChatSession[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSessions(uid: string | null | undefined, sessions: ChatSession[]) {
  try { localStorage.setItem(listKey(uid), JSON.stringify(sessions.slice(0, MAX_SESSIONS))); } catch { /* ignore */ }
}

function getActiveId(uid?: string | null): string | null {
  try { return localStorage.getItem(activeKey(uid)); } catch { return null; }
}

export function setActiveSession(uid: string | null | undefined, id: string) {
  try { localStorage.setItem(activeKey(uid), id); } catch { /* ignore */ }
}

// The session we should be showing right now. If the active session is missing
// or belongs to an earlier day, a fresh empty session for today is created and
// made active (this is the "new session per day" behaviour).
export function resolveActiveSession(uid?: string | null): ChatSession {
  const sessions = getSessions(uid);
  const activeId = getActiveId(uid);
  const active = sessions.find((s) => s.id === activeId);
  if (active && active.date === todayIso()) return active;

  // Start a fresh session for today.
  const fresh: ChatSession = { id: newId(), date: todayIso(), title: 'New chat', messages: [], updatedAt: new Date().toISOString() };
  writeSessions(uid, [fresh, ...sessions]);
  setActiveSession(uid, fresh.id);
  return fresh;
}

// Force a brand-new session (the "New chat" action), even mid-day.
export function startFreshSession(uid?: string | null): ChatSession {
  const sessions = getSessions(uid).filter((s) => s.messages.length > 0); // drop empty leftovers
  const fresh: ChatSession = { id: newId(), date: todayIso(), title: 'New chat', messages: [], updatedAt: new Date().toISOString() };
  writeSessions(uid, [fresh, ...sessions]);
  setActiveSession(uid, fresh.id);
  return fresh;
}

// Persist the current messages into the active session (upsert), refreshing its
// title + timestamp and floating it to the top of the list.
export function persistActiveMessages(uid: string | null | undefined, id: string, messages: StoredChatMessage[]) {
  const sessions = getSessions(uid);
  const existing = sessions.find((s) => s.id === id);
  const updated: ChatSession = {
    id,
    date: existing?.date || todayIso(),
    title: deriveTitle(messages),
    messages,
    updatedAt: new Date().toISOString(),
  };
  const rest = sessions.filter((s) => s.id !== id);
  writeSessions(uid, [updated, ...rest]);
}

export function deleteSession(uid: string | null | undefined, id: string) {
  writeSessions(uid, getSessions(uid).filter((s) => s.id !== id));
  if (getActiveId(uid) === id) {
    try { localStorage.removeItem(activeKey(uid)); } catch { /* ignore */ }
  }
}
