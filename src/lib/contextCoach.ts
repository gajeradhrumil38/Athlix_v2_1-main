import { briefingToday } from './dailyBriefing';

// Contextual coach: when you land on a data page, the coach pill proactively
// pops a short "how's the past, here's what to do next" note tailored to that
// screen. The heavy data (workouts, runs, WHOOP, PRs…) rides in the shared
// system prompt; each context only supplies the user turn that steers the
// answer. Throttled to once-per-context-per-day + a global cooldown so
// browsing around doesn't spam pills.

export interface CoachContext {
  id: string;
  matches: (pathname: string) => boolean;
  userTurn: string;
}

const COMMON = 'Speak AS my personal trainer — warm, direct, second person. 2–3 short sentences, plain text (no markdown, no lists). Use ONLY the data in the system context; cite a real number; never invent one.';

export const COACH_CONTEXTS: CoachContext[] = [
  {
    id: 'run-history',
    matches: (p) => p.startsWith('/run/history'),
    userTurn: `I just opened my running history. How's my running trending lately (pace / distance / how often), and what run should I do next? ${COMMON}`,
  },
  {
    id: 'progress',
    matches: (p) => p.startsWith('/progress'),
    userTurn: `I just opened my Progress page. How's my training volume and consistency trending, and what should I focus on next? ${COMMON}`,
  },
  {
    id: 'calendar',
    matches: (p) => p.startsWith('/calendar'),
    userTurn: `I just opened my workout calendar. How consistent have I been, which muscle group is overdue, and what should I train in the next day or two? ${COMMON}`,
  },
  {
    id: 'timeline',
    matches: (p) => p.startsWith('/timeline'),
    userTurn: `I just opened my workout history. What stands out in my recent sessions (a PR, a jump, a plateau), and what should I do next? ${COMMON}`,
  },
];

const firedKey = (id: string) => `athlix:ctx_coach:${id}`;

export function contextFiredToday(id: string): boolean {
  try { return localStorage.getItem(firedKey(id)) === briefingToday(); } catch { return false; }
}

export function markContextFired(id: string) {
  try { localStorage.setItem(firedKey(id), briefingToday()); } catch { /* ignore */ }
}
