import { format } from 'date-fns';

// The proactive "Coach's Note" shown on the home page. Generated once per day
// from the same rich system context the chat coach uses, then cached in
// localStorage so every later app-open that day is INSTANT (no regen, no cost).
// Logging a workout or changing today's "feeling" invalidates it so the next
// open reflects the change.

const CACHE_KEY = 'athlix:coach_note';
const FEELING_KEY = 'athlix:coach_feeling';
const SHOWN_KEY = 'athlix:coach_note_shown';

export const briefingToday = (): string => format(new Date(), 'yyyy-MM-dd');

// "Was the briefing pill surfaced yet today?" — separate from whether the TEXT
// is cached, so a note that got generated/cached without being shown (or by an
// older code path) still surfaces once. Marked only on a successful show.
export function briefingShownToday(): boolean {
  try { return localStorage.getItem(SHOWN_KEY) === briefingToday(); } catch { return false; }
}
export function markBriefingShownToday() {
  try { localStorage.setItem(SHOWN_KEY, briefingToday()); } catch { /* ignore */ }
}

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

// Deterministic short briefing used when the model call fails or returns
// empty, so the coach pill always ends in a message rather than a silent
// close. Built from the same signals (WHOOP recovery + which muscle group is
// most rested). `workouts`/`whoop` are loosely typed to avoid import cycles.
export function buildFallbackBriefing(name: string, workouts: any[], whoop: any): string {
  const rec = whoop?.recovery?.[0]?.recovery_score;
  const recLine = typeof rec === 'number'
    ? `Recovery's ${rec}% today — ${rec >= 67 ? 'good to push hard' : rec >= 34 ? 'keep it moderate' : 'take it easy'}.`
    : '';

  const age: Record<string, number> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const w of workouts || []) {
    if (!w?.date) continue;
    const d = new Date(`${w.date}T00:00:00`);
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    for (const mg of (w.muscle_groups || [])) {
      const k = String(mg);
      if (age[k] == null || days < age[k]) age[k] = days;
    }
  }
  const mostRested = Object.entries(age).sort((a, b) => b[1] - a[1])[0];
  const dueLine = mostRested
    ? `${mostRested[0].charAt(0).toUpperCase() + mostRested[0].slice(1)} is your most rested — good day to train it.`
    : 'Log a session today and I’ll tailor tomorrow’s plan.';

  return `Morning, ${name}. ${recLine} ${dueLine}`.replace(/\s+/g, ' ').trim();
}

// User turn for the briefing. The heavy context (workouts, WHOOP, PRs, …) rides
// in the system prompt (buildSystemPrompt 'insight'); this just says what shape
// of answer we want.
export function buildBriefingPrompt(name: string, feeling: string | null): string {
  return `Write ${name}'s daily coaching line for today, speaking AS their personal trainer — warm, direct, second person ("you"). MAX 2 short sentences (aim ~30 words). No greeting, no markdown, no lists. Use ONLY the system-context data; never invent numbers.

Say the ONE thing that matters most today, chosen from: today's readiness (WHOOP recovery/load), the muscle group most due to train (skip anything trained today/yesterday) with 1–2 concrete exercises, or a specific PR/plateau with its number.
${feeling ? `They feel "${feeling}" today — reflect it.` : ''}
If there's barely any data, give a one-line nudge to log today's session.`;
}
