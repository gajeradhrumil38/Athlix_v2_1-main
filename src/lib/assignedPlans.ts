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

export interface NewPlanExercise { name: string; sets: number; reps: number; weight: number; rest?: number; }

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
  }));
  const { error: exErr } = await supabase.from('assigned_plan_exercises').insert(rows);
  if (exErr) {
    await supabase.from('assigned_plans').delete().eq('id', row.id); // roll back the orphan
    return { ok: false, error: exErr.message };
  }
  return { ok: true };
}

function shape(rows: any[]): AssignedPlan[] {
  return (rows ?? []).map((p) => ({
    ...p,
    exercises: (p.assigned_plan_exercises ?? []).sort((a: any, b: any) => a.order_index - b.order_index),
  }));
}

const SELECT = '*, assigned_plan_exercises(name, muscle_group, default_sets, default_reps, default_weight, unit, order_index, day_label, rest_seconds)';

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
