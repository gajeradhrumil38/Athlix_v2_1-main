import { format } from 'date-fns';

// Persistent "what the coach knows about you" store. Offline-first in
// localStorage (same pattern as the daily-briefing cache), keyed per user so
// accounts sharing a device don't bleed. Holds three things the coach reads on
// every turn and can write to via function calls:
//   - goals: things the user is working toward (with optional structured target)
//   - facts: durable preferences / schedule / constraints ("trains MWF",
//            "bad shoulder — no overhead")
//   - checkIns: ISO dates the user engaged, for the accountability streak.

export interface CoachGoal {
  id: string;
  text: string;
  createdAt: string;   // ISO date
  done?: boolean;
  // Optional structured target so we can show a progress bar / cite a number.
  metric?: 'weight' | 'e1rm' | 'bodyweight' | 'runs' | 'sessions';
  exercise?: string;
  target?: number;
  unit?: string;
}

export interface CoachMemory {
  goals: CoachGoal[];
  facts: string[];
  checkIns: string[];  // ISO 'yyyy-MM-dd'
  updatedAt: string;
}

const EMPTY: CoachMemory = { goals: [], facts: [], checkIns: [], updatedAt: '' };
const key = (uid?: string | null) => `athlix:coach_memory:${uid || 'anon'}`;
const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function getCoachMemory(uid?: string | null): CoachMemory {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<CoachMemory>;
    return {
      goals: Array.isArray(p.goals) ? p.goals : [],
      facts: Array.isArray(p.facts) ? p.facts : [],
      checkIns: Array.isArray(p.checkIns) ? p.checkIns : [],
      updatedAt: p.updatedAt || '',
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(uid: string | null | undefined, m: CoachMemory): CoachMemory {
  const next = { ...m, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(key(uid), JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('athlix:coach-memory')); } catch { /* ignore */ }
  return next;
}

export function addCoachGoal(uid: string | null | undefined, goal: Omit<CoachGoal, 'id' | 'createdAt'>): CoachMemory {
  const m = getCoachMemory(uid);
  const text = goal.text.trim();
  if (!text) return m;
  // De-dupe on identical text (case-insensitive)
  if (m.goals.some((g) => g.text.toLowerCase() === text.toLowerCase())) return m;
  const next: CoachGoal = { id: newId(), createdAt: todayIso(), ...goal, text };
  return save(uid, { ...m, goals: [next, ...m.goals].slice(0, 12) });
}

export function completeCoachGoal(uid: string | null | undefined, idOrText: string): CoachMemory {
  const m = getCoachMemory(uid);
  const low = idOrText.toLowerCase();
  return save(uid, {
    ...m,
    goals: m.goals.map((g) =>
      g.id === idOrText || g.text.toLowerCase().includes(low) ? { ...g, done: true } : g,
    ),
  });
}

export function removeCoachGoal(uid: string | null | undefined, id: string): CoachMemory {
  const m = getCoachMemory(uid);
  return save(uid, { ...m, goals: m.goals.filter((g) => g.id !== id) });
}

export function addCoachFact(uid: string | null | undefined, fact: string): CoachMemory {
  const m = getCoachMemory(uid);
  const text = fact.trim();
  if (!text) return m;
  if (m.facts.some((f) => f.toLowerCase() === text.toLowerCase())) return m;
  return save(uid, { ...m, facts: [text, ...m.facts].slice(0, 16) });
}

export function removeCoachFact(uid: string | null | undefined, index: number): CoachMemory {
  const m = getCoachMemory(uid);
  return save(uid, { ...m, facts: m.facts.filter((_, i) => i !== index) });
}

// Record that the user engaged today (chat message or feeling check-in). Keeps
// the last 120 days so the streak calc stays cheap.
export function recordCheckIn(uid: string | null | undefined): CoachMemory {
  const m = getCoachMemory(uid);
  const t = todayIso();
  if (m.checkIns.includes(t)) return m;
  return save(uid, { ...m, checkIns: [...m.checkIns, t].slice(-120) });
}

// Consecutive-day streak from engagement (check-ins) + logged training, ending
// today or yesterday (today may not have happened yet — the streak survives).
export function coachStreak(memory: CoachMemory, workouts: { date: string }[]): number {
  const days = new Set<string>();
  for (const c of memory.checkIns) days.add(c.slice(0, 10));
  for (const w of workouts) if (w?.date) days.add(w.date.slice(0, 10));
  if (!days.size) return 0;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  if (!days.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1); // today empty → start at yesterday

  let streak = 0;
  while (days.has(iso(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Prompt block injected into the coach's system context.
export function buildCoachMemorySection(memory: CoachMemory | null, workouts: { date: string }[]): string {
  if (!memory) return '';
  const activeGoals = memory.goals.filter((g) => !g.done);
  const doneGoals = memory.goals.filter((g) => g.done);
  const streak = coachStreak(memory, workouts);
  if (!activeGoals.length && !memory.facts.length && !doneGoals.length && streak < 2) return '';

  const goalLines = activeGoals
    .map((g) => `  • ${g.text}${g.target != null ? ` (target: ${g.target}${g.unit || ''})` : ''}`)
    .join('\n');
  const factLines = memory.facts.map((f) => `  • ${f}`).join('\n');

  return `
━━ WHAT YOU REMEMBER ABOUT THEM ━━
${activeGoals.length ? `Active goals:\n${goalLines}` : 'No active goals set yet — if they state one, call set_goal to remember it.'}
${memory.facts.length ? `\nPreferences / constraints:\n${factLines}` : ''}
${doneGoals.length ? `\nRecently achieved: ${doneGoals.slice(0, 3).map((g) => g.text).join('; ')}` : ''}
${streak >= 2 ? `\nCurrent engagement streak: ${streak} days — acknowledge it when natural, don't force it.` : ''}
Reference their goals with real numbers and progress. Respect their constraints (never program around an injury they flagged). If they reveal a new durable goal, schedule, or constraint mid-chat, call set_goal or remember to save it.
`;
}
