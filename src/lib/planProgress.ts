import { groupByDay, type AssignedPlan } from './assignedPlans';

// Pure plan-progress logic: which day a session was, how far a trainee is
// through a plan, and which day comes next (rotation). No React, no Supabase.

export interface PlanSession {
  id: string;
  date: string; // yyyy-MM-dd (local)
  created_at?: string | null;
  source_plan_id: string | null;
  source_plan_day?: string | null;
  exercises?: { name: string }[] | null;
}

export interface DayProgress { label: string; doneRecently: boolean; lastDone: string | null; }

export interface PlanProgress {
  days: DayProgress[];
  nextDay: string;
  doneToday: boolean;
  doneTodayDay: string | null;
  sessionsThisWeek: number;
}

const DAY_MS = 86_400_000;
const norm = (v: string) => v.trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const withinWeek = (date: string, now: number) => now - new Date(`${date}T00:00:00`).getTime() < 7 * DAY_MS;

const newestFirst = (a: PlanSession, b: PlanSession) =>
  b.date.localeCompare(a.date) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

export function dayOfSession(plan: AssignedPlan, session: PlanSession): string | null {
  const groups = groupByDay(plan.exercises);
  if (!groups.length) return null;
  if (session.source_plan_day != null) {
    const hit = groups.find(([label]) => norm(label) === norm(session.source_plan_day!));
    if (hit) return hit[0];
  }
  // No usable stored day (logged before it was recorded, or the day was
  // renamed): pick the day whose exercises overlap most; ties → earlier day.
  const names = new Set((session.exercises ?? []).map((e) => norm(e.name)));
  let best = groups[0][0];
  let bestHits = -1;
  for (const [label, exs] of groups) {
    const hits = exs.filter((e) => names.has(norm(e.name))).length;
    if (hits > bestHits) { best = label; bestHits = hits; }
  }
  return best;
}

export function planProgress(plan: AssignedPlan, sessions: PlanSession[], now: number = Date.now()): PlanProgress {
  const labels = groupByDay(plan.exercises).map(([label]) => label);
  const mine = sessions.filter((s) => s.source_plan_id === plan.id).sort(newestFirst);
  const tagged = mine.map((s) => ({ s, day: dayOfSession(plan, s) }));
  const today = localDate(now);

  const days = labels.map((label) => {
    const last = tagged.find((t) => t.day === label);
    return { label, lastDone: last?.s.date ?? null, doneRecently: !!last && withinWeek(last.s.date, now) };
  });

  const latestDay = tagged[0]?.day;
  const idx = latestDay != null ? labels.indexOf(latestDay) : -1;
  const nextDay = labels.length ? labels[idx === -1 ? 0 : (idx + 1) % labels.length] : '';
  const todays = tagged.find((t) => t.s.date === today);

  return {
    days,
    nextDay,
    doneToday: !!todays,
    doneTodayDay: todays?.day ?? null,
    sessionsThisWeek: mine.filter((s) => withinWeek(s.date, now)).length,
  };
}

export function currentPlan(plans: AssignedPlan[], sessions: PlanSession[]): AssignedPlan | null {
  if (!plans.length) return null;
  const latest = [...sessions].filter((s) => plans.some((p) => p.id === s.source_plan_id)).sort(newestFirst)[0];
  if (latest) return plans.find((p) => p.id === latest.source_plan_id) ?? null;
  return [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
