import type { TraineeDashboard } from './coachData';
import type { AssignedPlan, NewPlanExercise } from './assignedPlans';
import { DEFAULT_REPS, DEFAULT_REST, DEFAULT_SETS, type PlanStarter } from './planStarters';
import { exerciseSeries, matchExercise } from './traineeAiVisuals';

// Turn what the AI proposes into something safe to show the coach for
// approval. Every check here is against the trainee's real data.

export interface Progression { name: string; from: number; to: number; planId: string | null; planTitle: string | null }

// A suggested new working weight is only offered when it names a lift the
// trainee actually does and stays within a sane jump (≤ 20% over their best).
export function checkProgression(dash: TraineeDashboard, plans: AssignedPlan[], name: string, weight: number): Progression | null {
  if (!dash.workouts.shared || !(weight > 0)) return null;
  const real = matchExercise(dash.workouts.data, name);
  if (!real) return null;
  const series = exerciseSeries(dash.workouts.data, real);
  if (!series.length) return null;
  const last = series[series.length - 1].value;
  const pr = dash.prs.shared ? dash.prs.data.find((p) => p.exercise_name === real)?.best_weight ?? 0 : 0;
  const ceiling = Math.max(last, ...series.map((p) => p.value), pr) * 1.2;
  const to = Math.round(weight * 2) / 2;
  if (to > ceiling) return null;
  // The newest plan that prescribes this lift is the one to update.
  const plan = [...plans].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .find((p) => p.exercises.some((e) => e.name.toLowerCase() === real.toLowerCase())) ?? null;
  // "from" is what changes: the plan's prescription when there is one.
  const prescribed = plan?.exercises.find((e) => e.name.toLowerCase() === real.toLowerCase())?.default_weight;
  const from = prescribed ?? last;
  if (to === from) return null;
  return { name: real, from, to, planId: plan?.id ?? null, planTitle: plan?.title ?? null };
}

// The plan's exercises with one lift's prescribed weight changed.
export function withNewWeight(plan: AssignedPlan, name: string, weight: number): NewPlanExercise[] {
  return [...plan.exercises].sort((a, b) => a.order_index - b.order_index).map((e) => ({
    name: e.name,
    sets: e.default_sets,
    reps: e.default_reps,
    weight: e.name.toLowerCase() === name.toLowerCase() ? weight : e.default_weight,
    rest: e.rest_seconds ?? undefined,
    note: e.note ?? undefined,
    day: e.day_label ?? undefined,
  }));
}

export const PLAN_JSON_REQUEST = (first: string, ask: string) => `Draft next week's training plan for ${first}. ${ask ? `Coach's request: ${ask}.` : ''}
Base it on ${first}'s recent sessions, weights and any gaps or stalls. Use exercise names ${first} already does where they fit.
Reply with ONLY this JSON, no other text:
{"title": "...", "message": "one short line to ${first}", "days": [{"label": "Day 1 – Push", "exercises": [{"name": "...", "sets": 3, "reps": 8, "weight": 135, "note": ""}]}]}
2–5 days, 3–7 exercises per day, weights in lb (0 for bodyweight).`;

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// The model's JSON → a plan the Assign sheet can open. Names are snapped to
// what the trainee already logs when close; numbers are clamped.
export function planDraftFromAi(raw: string, dash: TraineeDashboard): (PlanStarter & { message: string }) | null {
  const body = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return null; }
  const workouts = dash.workouts.shared ? dash.workouts.data : [];
  const days = (Array.isArray(parsed?.days) ? parsed.days : []).slice(0, 6).map((d: any, i: number) => ({
    label: String(d?.label ?? `Day ${i + 1}`).slice(0, 40),
    rows: (Array.isArray(d?.exercises) ? d.exercises : []).slice(0, 10)
      .filter((e: any) => typeof e?.name === 'string' && e.name.trim())
      .map((e: any) => {
        const known = matchExercise(workouts, e.name);
        const name = known && known.toLowerCase().includes(String(e.name).toLowerCase().split(' ')[0]) ? known : String(e.name).trim().slice(0, 60);
        return {
          name,
          sets: clamp(e.sets, 1, 10, DEFAULT_SETS),
          reps: clamp(e.reps, 1, 50, DEFAULT_REPS),
          weight: Math.max(0, Math.min(1500, Math.round((Number(e.weight) || 0) * 2) / 2)),
          rest: DEFAULT_REST,
          note: typeof e.note === 'string' ? e.note.slice(0, 120) : '',
        };
      }),
  })).filter((d: { rows: unknown[] }) => d.rows.length);
  if (!days.length) return null;
  return {
    title: String(parsed.title || 'Next week').slice(0, 60),
    message: typeof parsed.message === 'string' ? parsed.message.slice(0, 200) : '',
    days,
  };
}
