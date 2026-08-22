import { supabase } from './supabase';

// Trainer ↔ trainee links. All authority is enforced in the database (RLS +
// coach_can_see); these helpers are thin, and every write only succeeds for the
// side the policy allows. Display names are snapshotted on the row so neither
// side needs a cross-user profile read.

export type ScopeKey =
  | 'workouts' | 'prs' | 'runs' | 'recovery' | 'sleep' | 'strain' | 'body_weight' | 'food';

// The categories a trainee can choose to share, in display order.
export const SHARE_SCOPES: { key: ScopeKey; label: string; hint: string }[] = [
  { key: 'workouts',    label: 'Workouts',    hint: 'Your logged sessions, sets and volume' },
  { key: 'prs',         label: 'Personal records', hint: 'Your best lifts' },
  { key: 'runs',        label: 'Runs',        hint: 'Distance, pace and routes' },
  { key: 'recovery',    label: 'Recovery',    hint: 'WHOOP recovery score' },
  { key: 'sleep',       label: 'Sleep',       hint: 'Hours and sleep quality' },
  { key: 'strain',      label: 'Strain',      hint: 'Daily strain and activities' },
  { key: 'body_weight', label: 'Body weight', hint: 'Your weight trend' },
  { key: 'food',        label: 'Nutrition',   hint: 'Logged food scans' },
];

export type LinkStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface CoachLink {
  id: string;
  trainer_id: string;
  trainee_id: string | null;
  invited_email: string;
  status: LinkStatus;
  shared_scopes: Partial<Record<ScopeKey, boolean>>;
  trainer_name: string | null;
  trainee_name: string | null;
  coach_notes: string | null;
  created_at: string;
  responded_at: string | null;
}

async function me(): Promise<{ id: string; email: string | null } | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

async function myDisplayName(uid: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('trainer_display_name, full_name')
    .eq('id', uid)
    .maybeSingle();
  return data?.trainer_display_name || data?.full_name || null;
}

// ── Trainer side ────────────────────────────────────────────────────

// Whether an email already belongs to an Athlix account (drives the in-app
// invite vs. "get them to sign up" messaging). Boolean only — no data leaks.
export async function isEmailRegistered(email: string): Promise<boolean> {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  try {
    const { data } = await supabase.rpc('email_is_registered', { p_email: clean });
    return !!data;
  } catch {
    return false;
  }
}

// Invite a trainee by email. Idempotent-ish: the unique index blocks a second
// live invite to the same email, surfaced as a friendly error. Returns whether
// the invitee is already registered: if so they'll get the in-app popup; if not,
// the pending invite waits and surfaces the moment they sign up with this email.
export async function inviteTrainee(email: string): Promise<{ ok: boolean; error?: string; registered?: boolean }> {
  const u = await me();
  if (!u) return { ok: false, error: 'Not signed in.' };
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: 'Enter a valid email.' };
  if (clean === (u.email ?? '').toLowerCase()) return { ok: false, error: "That's your own email." };

  const registered = await isEmailRegistered(clean);

  const { error } = await supabase.from('coach_links').insert({
    trainer_id: u.id,
    invited_email: clean,
    status: 'pending',
    shared_scopes: {},
    trainer_name: await myDisplayName(u.id),
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'You already have a live invite for that email.' };
    return { ok: false, error: error.message };
  }
  return { ok: true, registered };
}

// Every link this trainer created (pending + accepted + past).
export async function getSentLinks(): Promise<CoachLink[]> {
  const u = await me();
  if (!u) return [];
  const { data } = await supabase
    .from('coach_links')
    .select('*')
    .eq('trainer_id', u.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as CoachLink[];
}

// Trainer's private notes on a trainee (they own the link row → RLS allows it).
export async function updateCoachNotes(linkId: string, notes: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('coach_links').update({ coach_notes: notes }).eq('id', linkId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Trainee side ────────────────────────────────────────────────────

// Pending invites addressed to my email (RLS already scopes this to me).
export async function getIncomingInvites(): Promise<CoachLink[]> {
  const { data } = await supabase
    .from('coach_links')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data ?? []) as CoachLink[];
}

// Coaches I've accepted.
export async function getMyCoaches(): Promise<CoachLink[]> {
  const u = await me();
  if (!u) return [];
  const { data } = await supabase
    .from('coach_links')
    .select('*')
    .eq('trainee_id', u.id)
    .eq('status', 'accepted')
    .order('responded_at', { ascending: false });
  return (data ?? []) as CoachLink[];
}

// Accept (claims the row for me + records what I chose to share) or decline.
export async function respondToInvite(
  id: string,
  accept: boolean,
  scopes: Partial<Record<ScopeKey, boolean>> = {},
): Promise<{ ok: boolean; error?: string }> {
  const u = await me();
  if (!u) return { ok: false, error: 'Not signed in.' };
  const patch = accept
    ? { status: 'accepted' as LinkStatus, trainee_id: u.id, shared_scopes: scopes, trainee_name: await myDisplayName(u.id), responded_at: new Date().toISOString() }
    : { status: 'declined' as LinkStatus, responded_at: new Date().toISOString() };
  const { error } = await supabase.from('coach_links').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Change what an accepted coach can see.
export async function updateShareScopes(
  id: string,
  scopes: Partial<Record<ScopeKey, boolean>>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('coach_links').update({ shared_scopes: scopes }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Trainee cuts a coach off (revoke). Access stops on the coach's next query.
export async function disconnect(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('coach_links')
    .update({ status: 'revoked', shared_scopes: {}, responded_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
