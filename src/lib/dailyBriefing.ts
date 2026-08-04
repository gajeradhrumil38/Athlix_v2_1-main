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

export const periodOfDay = (): 'morning' | 'afternoon' | 'evening' => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};

// "Was the briefing pill surfaced yet today?" — separate from whether the TEXT
// is cached, so a note that got generated/cached without being shown (or by an
// older code path) still surfaces once. Marked only on a successful show.
export function briefingShownToday(): boolean {
  try { return localStorage.getItem(SHOWN_KEY) === briefingToday(); } catch { return false; }
}
export function markBriefingShownToday() {
  try { localStorage.setItem(SHOWN_KEY, briefingToday()); } catch { /* ignore */ }
}

export interface CachedBriefing { date: string; period: string; text: string }

// Cache is keyed by date AND period (morning/afternoon/evening) so the note
// stays valid for the whole period — every app open within it is instant and
// free — but a new period gets a fresh, time-appropriate briefing.
export function getCachedBriefing(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as CachedBriefing;
    return p?.date === briefingToday() && p.period === periodOfDay() && p.text ? p : null;
  } catch { return null; }
}

export function setCachedBriefing(text: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ date: briefingToday(), period: periodOfDay(), text })); } catch { /* ignore */ }
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
  let sessions7 = 0;
  for (const w of workouts || []) {
    if (!w?.date) continue;
    const d = new Date(`${w.date}T00:00:00`);
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (days >= 0 && days <= 6) sessions7 += 1;
    for (const mg of (w.muscle_groups || [])) {
      const k = String(mg);
      if (age[k] == null || days < age[k]) age[k] = days;
    }
  }
  const mostRested = Object.entries(age).sort((a, b) => b[1] - a[1])[0];
  const dueLine = mostRested
    ? `${mostRested[0].charAt(0).toUpperCase() + mostRested[0].slice(1)} is your most rested — good day to train it.`
    : 'Log a session today and I’ll tailor tomorrow’s plan.';
  const weekLine = sessions7 > 0 ? ` You've trained ${sessions7} time${sessions7 === 1 ? '' : 's'} in the last 7 days.` : '';

  const p = periodOfDay();
  const hi = p === 'morning' ? 'Morning' : p === 'afternoon' ? 'Afternoon' : 'Evening';
  return `${hi}, ${name}. ${recLine} ${dueLine}${weekLine}`.replace(/\s+/g, ' ').trim();
}

// User turn for the briefing. The heavy context (workouts, WHOOP, PRs, …) rides
// in the system prompt (buildSystemPrompt 'insight'); this just says what shape
// of answer we want.
export function buildBriefingPrompt(name: string, feeling: string | null): string {
  const period = periodOfDay();
  const periodHint = period === 'morning' ? 'It\'s morning — set up their day.'
    : period === 'afternoon' ? 'It\'s the afternoon — a mid-day check-in; note if they\'ve trained yet.'
    : 'It\'s evening — reflect on today and point at tomorrow.';
  return `Write ${name}'s ${period} coaching briefing, speaking AS their personal trainer — warm, direct, second person ("you"). ${periodHint} 3 short sentences (aim ~55 words). No greeting header, no markdown, no lists. Use ONLY the system-context data; never invent numbers.

Cover, tightly:
1) Today's readiness — one line from WHOOP recovery/load (cite the recovery % or ACWR if present).
2) What to train today — the muscle group most due (skip anything trained today/yesterday), with 2 concrete exercises and sets×reps.
3) One number to chase — a PR to beat or a plateau to break, with the actual figure.
${feeling ? `They feel "${feeling}" today — reflect it in the call.` : ''}
If there's barely any data, give a short two-line nudge to log today's session instead.`;
}
