import { supabase } from './supabase';
import type { TrainerAppointment } from './appointments';
import type { Signal } from './traineeSignals';

// Session packages ("12 sessions, $600"). Sessions used are counted from the
// trainer's appointments with the trainee — 'completed' (attended), plus
// 'no_show' when the package charges for them — inside the package's window.

export interface SessionPackage {
  id: string;
  trainer_id: string;
  trainee_id: string;
  title: string;
  total_sessions: number;
  price: number | null;
  starts_on: string;          // yyyy-mm-dd
  expires_on: string | null;  // yyyy-mm-dd
  count_no_shows: boolean;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface PackageUsage {
  pkg: SessionPackage;
  used: number;
  left: number;
  noShows: number;
  expired: boolean;
  daysToExpiry: number | null;
}

type Appt = Pick<TrainerAppointment, 'trainee_id' | 'status' | 'scheduled_at'>;

const DAY = 86_400_000;
const ymdLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The current package for one trainee and how much of it is used. Each
// package counts sessions from its start until it expires or the next package
// starts — so renewing early never double-counts.
export function packageUsage(pkgs: SessionPackage[], appts: Appt[], today = new Date()): PackageUsage | null {
  const todayYmd = ymdLocal(today.toISOString());
  const live = pkgs.filter((p) => !p.archived_at && p.starts_on <= todayYmd).sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.created_at.localeCompare(b.created_at));
  if (!live.length) return null;
  const pkg = live[live.length - 1];
  const nextStart = pkgs.filter((p) => !p.archived_at && p.starts_on > pkg.starts_on).map((p) => p.starts_on).sort()[0];
  const inWindow = (a: Appt) => {
    const d = ymdLocal(a.scheduled_at);
    return d >= pkg.starts_on && (!pkg.expires_on || d <= pkg.expires_on) && (!nextStart || d < nextStart) && d <= todayYmd;
  };
  const mine = appts.filter((a) => a.trainee_id === pkg.trainee_id && inWindow(a));
  const attended = mine.filter((a) => a.status === 'completed').length;
  const noShows = mine.filter((a) => a.status === 'no_show').length;
  const used = Math.min(pkg.total_sessions, attended + (pkg.count_no_shows ? noShows : 0));
  const expired = !!pkg.expires_on && pkg.expires_on < todayYmd;
  const daysToExpiry = pkg.expires_on ? Math.round((new Date(`${pkg.expires_on}T00:00:00`).getTime() - new Date(`${todayYmd}T00:00:00`).getTime()) / DAY) : null;
  return { pkg, used, left: pkg.total_sessions - used, noShows, expired, daysToExpiry };
}

// Turn-up rate over a recent window: attended ÷ (attended + no-shows).
export function attendance(appts: Appt[], traineeId: string, days = 90, today = new Date()) {
  const from = today.getTime() - days * DAY;
  const mine = appts.filter((a) => a.trainee_id === traineeId && new Date(a.scheduled_at).getTime() >= from && new Date(a.scheduled_at).getTime() <= today.getTime());
  const attended = mine.filter((a) => a.status === 'completed').length;
  const noShows = mine.filter((a) => a.status === 'no_show').length;
  const total = attended + noShows;
  return { attended, noShows, rate: total ? Math.round((attended / total) * 100) : null };
}

/* ── Data ─────────────────────────────────────────── */

export async function getMyPackages(): Promise<SessionPackage[]> {
  const { data, error } = await supabase.from('session_packages').select('*').is('archived_at', null).order('starts_on', { ascending: true });
  // Before the migration runs the table doesn't exist — treat as "no packages".
  if (error) return [];
  return (data ?? []) as SessionPackage[];
}

export async function createPackage(input: {
  traineeId: string; title: string; totalSessions: number; price?: number | null; startsOn: string; expiresOn?: string | null; countNoShows?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('session_packages').insert({
    trainee_id: input.traineeId,
    title: input.title.trim() || `${input.totalSessions} sessions`,
    total_sessions: Math.max(1, Math.min(500, Math.round(input.totalSessions))),
    price: input.price ?? null,
    starts_on: input.startsOn,
    expires_on: input.expiresOn ?? null,
    count_no_shows: input.countNoShows ?? true,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function archivePackage(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('session_packages').update({ archived_at: new Date().toISOString() }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// A walk-in session with no booking: record it straight as attended (never
// 'scheduled', so the trainee doesn't get a "new appointment" popup).
export async function recordWalkInSession(traineeId: string, traineeName: string | null, trainerName: string | null): Promise<{ ok: boolean; error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: 'Not signed in.' };
  const { error } = await supabase.from('trainer_appointments').insert({
    trainer_id: u.user.id, trainee_id: traineeId, title: 'Session', scheduled_at: new Date().toISOString(),
    duration_minutes: 60, status: 'completed', trainer_name: trainerName, trainee_name: traineeName,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Logging a session for a trainee who was booked today means they turned up:
// mark that booking attended so the package counts it. Best effort.
export async function markTodaysBookingAttended(traineeId: string, now = new Date()): Promise<boolean> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { data } = await supabase.from('trainer_appointments').select('id')
    .eq('trainer_id', u.user.id).eq('trainee_id', traineeId).eq('status', 'scheduled')
    .gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true }).limit(1);
  const id = data?.[0]?.id;
  if (!id) return false;
  const { error } = await supabase.from('trainer_appointments').update({ status: 'completed' }).eq('id', id);
  return !error;
}

// Package problems as roster signals (same shape as traineeSignals).
export function packageSignals(u: PackageUsage | null): Signal[] {
  if (!u) return [];
  const { left, expired, daysToExpiry } = u;
  if (expired) return [{ id: 'pkg-expired', level: 'high', label: 'Package expired', fact: 'Their session package has expired.', chip: 'Package expired — renew?' }];
  if (left === 0) return [{ id: 'pkg-empty', level: 'high', label: 'Package used up', fact: 'All sessions in their package are used.', chip: 'Package used up — renew?' }];
  if (left <= 2) return [{ id: 'pkg-low', level: 'warn', label: `${left} session${left === 1 ? '' : 's'} left`, fact: `Only ${left} session${left === 1 ? '' : 's'} left in their package.`, chip: `${left} session${left === 1 ? '' : 's'} left — renew?` }];
  if (daysToExpiry != null && daysToExpiry <= 7) return [{ id: 'pkg-expiring', level: 'warn', label: `Package expires in ${daysToExpiry}d`, fact: `Their package expires in ${daysToExpiry} days with ${left} sessions unused.`, chip: 'Package expiring — plan the remaining sessions?' }];
  return [];
}
