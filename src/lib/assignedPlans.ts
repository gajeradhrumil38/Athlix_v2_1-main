import { supabase } from './supabase';

// Plans a trainer assigns to a trainee. Trainer has full CRUD on their own
// plans; the trainee can read plans assigned to them (RLS enforced). A plan is
// a title + notes + an ordered list of exercises.

export interface AssignedPlanExercise {
  name: string;
  muscle_group?: string | null;
  default_sets: number;
  default_reps: number;
  default_weight: number;
  unit: string;
  order_index: number;
  day_label?: string | null;
  rest_seconds?: number | null;
  note?: string | null;
}

export interface AssignedPlan {
  id: string;
  trainer_id: string;
  trainee_id: string;
  title: string;
  notes: string | null;
  status: 'active' | 'archived';
  created_at: string;
  exercises: AssignedPlanExercise[];
}

export interface NewPlanExercise { name: string; sets: number; reps: number; weight: number; rest?: number; note?: string; day?: string; }

async function meId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Trainer assigns a plan. Inserts the plan, then its exercises.
export async function assignPlan(
  traineeId: string,
  plan: { title: string; notes?: string; exercises: NewPlanExercise[] },
): Promise<{ ok: boolean; error?: string }> {
  const trainer = await meId();
  if (!trainer) return { ok: false, error: 'Not signed in.' };
  if (!plan.title.trim()) return { ok: false, error: 'Give the plan a name.' };
  if (!plan.exercises.length) return { ok: false, error: 'Add at least one exercise.' };

  const { data: row, error } = await supabase
    .from('assigned_plans')
    .insert({ trainer_id: trainer, trainee_id: traineeId, title: plan.title.trim(), notes: plan.notes?.trim() || null })
    .select('id')
    .single();
  if (error || !row) return { ok: false, error: error?.message || 'Could not create plan.' };

  const rows = plan.exercises.map((e, i) => ({
    plan_id: row.id,
    name: e.name.trim(),
    default_sets: Math.max(1, Math.round(e.sets) || 3),
    default_reps: Math.max(1, Math.round(e.reps) || 10),
    default_weight: Number(e.weight) || 0,
    unit: 'lbs',
    order_index: i,
    rest_seconds: e.rest != null ? Math.max(0, Math.round(e.rest)) : null,
    note: e.note?.trim() || null,
    day_label: e.day?.trim() || null,
  }));
  const { error: exErr } = await supabase.from('assigned_plan_exercises').insert(rows);
  if (exErr) {
    await supabase.from('assigned_plans').delete().eq('id', row.id); // roll back the orphan
    return { ok: false, error: exErr.message };
  }
  return { ok: true };
}

// Edit an existing plan — updates title/notes, then replaces its exercises
// wholesale (simplest way to keep order_index consistent without
// reconciling adds/removes/reorders row by row). If the exercises insert
// fails after the old rows are already gone, best-effort restores them so
// a flaky network error can't leave the plan silently empty.
export async function updatePlan(
  planId: string,
  plan: { title: string; notes?: string; exercises: NewPlanExercise[] },
): Promise<{ ok: boolean; error?: string }> {
  if (!plan.title.trim()) return { ok: false, error: 'Give the plan a name.' };
  if (!plan.exercises.length) return { ok: false, error: 'Add at least one exercise.' };

  const { error: updateErr } = await supabase
    .from('assigned_plans')
    .update({ title: plan.title.trim(), notes: plan.notes?.trim() || null })
    .eq('id', planId);
  if (updateErr) return { ok: false, error: updateErr.message };

  const { data: oldRows } = await supabase
    .from('assigned_plan_exercises')
    .select('name, muscle_group, default_sets, default_reps, default_weight, unit, order_index, day_label, rest_seconds, note')
    .eq('plan_id', planId);

  const { error: delErr } = await supabase.from('assigned_plan_exercises').delete().eq('plan_id', planId);
  if (delErr) return { ok: false, error: delErr.message };

  const rows = plan.exercises.map((e, i) => ({
    plan_id: planId,
    name: e.name.trim(),
    default_sets: Math.max(1, Math.round(e.sets) || 3),
    default_reps: Math.max(1, Math.round(e.reps) || 10),
    default_weight: Number(e.weight) || 0,
    unit: 'lbs',
    order_index: i,
    rest_seconds: e.rest != null ? Math.max(0, Math.round(e.rest)) : null,
    note: e.note?.trim() || null,
    day_label: e.day?.trim() || null,
  }));
  const { error: insErr } = await supabase.from('assigned_plan_exercises').insert(rows);
  if (insErr) {
    if (oldRows?.length) await supabase.from('assigned_plan_exercises').insert(oldRows.map((r) => ({ ...r, plan_id: planId })));
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

// Group a plan's exercises by day_label, preserving first-appearance order.
// A plan with no days set (every day_label null) collapses to one group
// with an empty label — callers should treat that as "no day chrome to
// show", not render a blank day header.
export function groupByDay(exercises: AssignedPlanExercise[]): [string, AssignedPlanExercise[]][] {
  const order: string[] = [];
  const map = new Map<string, AssignedPlanExercise[]>();
  for (const ex of exercises) {
    const label = ex.day_label?.trim() || '';
    if (!map.has(label)) { map.set(label, []); order.push(label); }
    map.get(label)!.push(ex);
  }
  return order.map((label) => [label, map.get(label)!]);
}

function shape(rows: any[]): AssignedPlan[] {
  return (rows ?? []).map((p) => ({
    ...p,
    exercises: (p.assigned_plan_exercises ?? []).sort((a: any, b: any) => a.order_index - b.order_index),
  }));
}

const SELECT = '*, assigned_plan_exercises(name, muscle_group, default_sets, default_reps, default_weight, unit, order_index, day_label, rest_seconds, note)';

// Trainer: plans they assigned to a given trainee.
export async function getAssignedPlansFor(traineeId: string): Promise<AssignedPlan[]> {
  const { data } = await supabase
    .from('assigned_plans')
    .select(SELECT)
    .eq('trainee_id', traineeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return shape(data ?? []);
}

// Trainee: plans assigned to me.
export async function getMyAssignedPlans(): Promise<AssignedPlan[]> {
  const me = await meId();
  if (!me) return [];
  const { data } = await supabase
    .from('assigned_plans')
    .select(SELECT)
    .eq('trainee_id', me)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return shape(data ?? []);
}

export async function archivePlan(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('assigned_plans').update({ status: 'archived' }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Hard delete — there's no "view archived plans" UI anywhere, so an
// archived plan just silently vanished forever anyway; this removes the
// row for real instead of leaving an orphan. Cascades to
// assigned_plan_exercises via its ON DELETE CASCADE FK.
//
// Supabase's delete() does NOT error when zero rows match (e.g. RLS
// silently filters the row out, or it's already gone) — it just reports
// success having deleted nothing. .select() forces the deleted row(s) back
// so we can tell a real delete from a silent no-op instead of reporting
// "ok" when the plan is actually still there.
export async function deletePlan(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.from('assigned_plans').delete().eq('id', id).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Plan not found or you do not have permission to delete it.' };
  return { ok: true };
}
