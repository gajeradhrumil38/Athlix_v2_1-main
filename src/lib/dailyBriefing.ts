import { format } from 'date-fns';

// The proactive "Coach's Note" shown on the home page. Generated once per day
// from the same rich system context the chat coach uses, then cached in
// localStorage so every later app-open that day is INSTANT (no regen, no cost).
// Logging a workout or changing today's "feeling" invalidates it so the next
// open reflects the change.

const CACHE_KEY = 'athlix:coach_note';
const FEELING_KEY = 'athlix:coach_feeling';

export const briefingToday = (): string => format(new Date(), 'yyyy-MM-dd');

export interface CachedBriefing { date: string; text: string }

export function getCachedBriefing(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as CachedBriefing;
    return p?.date === briefingToday() && p.text ? p : null;
  } catch { return null; }
}

export function setCachedBriefing(text: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date: briefingToday(), text })); } catch { /* ignore */ }
}

export function invalidateBriefing() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export function getTodayFeeling(): string | null {
  try {
    const raw = localStorage.getItem(FEELING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { date: string; feeling: string };
    return p?.date === briefingToday() ? p.feeling : null;
  } catch { return null; }
}

export function setTodayFeeling(feeling: string) {
  try { localStorage.setItem(FEELING_KEY, JSON.stringify({ date: briefingToday(), feeling })); } catch { /* ignore */ }
  invalidateBriefing(); // regenerate the note with the new feeling in mind
}

// User turn for the briefing. The heavy context (workouts, WHOOP, PRs, …) rides
// in the system prompt (buildSystemPrompt 'insight'); this just says what shape
// of answer we want.
export function buildBriefingPrompt(name: string, feeling: string | null): string {
  return `Write ${name}'s daily coaching briefing for today, speaking AS their personal trainer — warm, direct, second person ("you"). 2 to 4 flowing sentences, no greeting header, no markdown, no bullet lists. Use ONLY the data in the system context; never invent numbers.

Cover, in order:
1) A one-line readiness read from WHOOP recovery/load if present (e.g. "recovery's low today, keep it easy").
2) What to train TODAY: pick the muscle group most in need — longest since trained, or under its weekly volume target — and skip anything trained today or yesterday (⛔). Name 2–3 concrete exercises with sets×reps.
3) One specific progression cue: a PR to chase or a plateau to break, citing the actual number.
${feeling ? `The athlete says they feel "${feeling}" today — weave that into the call (e.g. dial it back if sore/tired, push if fresh).` : ''}
If there's barely any logged data, skip the plan and give a short encouraging nudge to log today's session instead.`;
}
