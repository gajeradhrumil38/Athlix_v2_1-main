import { supabase } from './supabase';

// Trainer-scheduled sessions with a trainee — "when we're doing it", as
// distinct from an assigned plan ("what to do"). Optionally points at a
// plan, but works standalone too (a check-in call, a session with notes
// but no formal prescription).

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export interface TrainerAppointment {
  id: string;
  trainer_id: string;
  trainee_id: string;
  title: string;
  notes: string | null;
  scheduled_at: string; // ISO timestamp
  duration_minutes: number | null;
  status: AppointmentStatus;
  assigned_plan_id: string | null;
  assigned_plan_title: string | null;
  trainer_name: string | null;
  trainee_name: string | null;
  review_notes: string | null;
  created_at: string;
}

// "11:00 AM – 11:30 AM" when a duration is known, otherwise just the start
// time — used anywhere an appointment's time shows so the trainee/trainer
// both see the actual span, not just when it begins.
export const formatApptTimeRange = (start: Date, durationMinutes: number | null): string => {
  const startStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!durationMinutes) return startStr;
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const endStr = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${startStr} – ${endStr}`;
};

async function meId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function myDisplayName(uid: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('trainer_display_name, full_name').eq('id', uid).maybeSingle();
  return data?.trainer_display_name || data?.full_name || null;
}

// Trainer creates an appointment for one of their trainees. traineeName is
// passed in by the caller (already has it from the roster picker) rather
// than re-fetched, since coach_links already snapshots it for this exact
// trainer-trainee pair.
export async function createAppointment(
  traineeId: string,
  traineeName: string | null,
  input: { title: string; notes?: string; scheduledAt: string; durationMinutes?: number; assignedPlanId?: string | null; assignedPlanTitle?: string | null },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const trainer = await meId();
  if (!trainer) return { ok: false, error: 'Not signed in.' };
  if (!input.title.trim()) return { ok: false, error: 'Give the appointment a title.' };
  if (!input.scheduledAt) return { ok: false, error: 'Pick a date and time.' };

  const trainerName = await myDisplayName(trainer);

  const { data, error } = await supabase
    .from('trainer_appointments')
    .insert({
      trainer_id: trainer,
      trainee_id: traineeId,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes ?? null,
      assigned_plan_id: input.assignedPlanId ?? null,
      assigned_plan_title: input.assignedPlanId ? (input.assignedPlanTitle ?? null) : null,
      trainer_name: trainerName,
      trainee_name: traineeName,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Could not create appointment.' };
  return { ok: true, id: data.id };
}

export async function updateAppointment(
  id: string,
  input: {
    title?: string; notes?: string | null; scheduledAt?: string; durationMinutes?: number | null;
    status?: AppointmentStatus; assignedPlanId?: string | null; assignedPlanTitle?: string | null; reviewNotes?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, any> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.scheduledAt !== undefined) patch.scheduled_at = input.scheduledAt;
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.status !== undefined) patch.status = input.status;
  if (input.assignedPlanId !== undefined) patch.assigned_plan_id = input.assignedPlanId;
  if (input.assignedPlanTitle !== undefined) patch.assigned_plan_title = input.assignedPlanTitle;
  if (input.reviewNotes !== undefined) patch.review_notes = input.reviewNotes?.trim() || null;

  const { error } = await supabase.from('trainer_appointments').update(patch).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Mirrors deletePlan()'s pattern: .select() forces the deleted row back so a
// silent RLS no-op (zero rows matched) is reported as a real failure
// instead of false "success".
export async function deleteAppointment(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.from('trainer_appointments').delete().eq('id', id).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Appointment not found or you do not have permission to delete it.' };
  return { ok: true };
}

// Trainee: appointments made for me, by any trainer.
export async function getMyAppointments(range?: { startDate: string; endDate: string }): Promise<TrainerAppointment[]> {
  const me = await meId();
  if (!me) return [];
  let query = supabase.from('trainer_appointments').select('*').eq('trainee_id', me);
  if (range) query = query.gte('scheduled_at', range.startDate).lte('scheduled_at', range.endDate);
  const { data } = await query.order('scheduled_at', { ascending: true });
  return (data ?? []) as TrainerAppointment[];
}

// Trainer: appointments they created for one specific trainee (used by the
// coach's read-only view of that trainee's calendar).
export async function getAppointmentsForTrainee(traineeId: string, range?: { startDate: string; endDate: string }): Promise<TrainerAppointment[]> {
  let query = supabase.from('trainer_appointments').select('*').eq('trainee_id', traineeId);
  if (range) query = query.gte('scheduled_at', range.startDate).lte('scheduled_at', range.endDate);
  const { data } = await query.order('scheduled_at', { ascending: true });
  return (data ?? []) as TrainerAppointment[];
}

// Trainer: every appointment they've created, across all their trainees —
// used to lay appointments over the trainer's own personal calendar.
export async function getMyCreatedAppointments(range?: { startDate: string; endDate: string }): Promise<TrainerAppointment[]> {
  const me = await meId();
  if (!me) return [];
  let query = supabase.from('trainer_appointments').select('*').eq('trainer_id', me);
  if (range) query = query.gte('scheduled_at', range.startDate).lte('scheduled_at', range.endDate);
  const { data } = await query.order('scheduled_at', { ascending: true });
  return (data ?? []) as TrainerAppointment[];
}
