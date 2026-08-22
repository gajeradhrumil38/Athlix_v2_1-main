import { supabase } from './supabase';
import { getSentLinks, SHARE_SCOPES, type CoachLink, type ScopeKey } from './coachLinks';

// Trainer-side reads of a trainee's data. Every query filters by the trainee's
// user_id; the database (coach_can_see + per-table policies) is what actually
// authorizes each row, so a scope the trainee turned off simply returns nothing.
// We ALSO check the link's shared_scopes here so the UI can show a clean
// "not shared" card instead of an empty chart.

export interface Section<T> { shared: boolean; data: T; }

export interface TraineeWorkout {
  id: string; date: string; title: string; duration_minutes: number | null; muscle_groups: string[] | null;
  source_plan_id: string | null;
  exercises: { name: string; muscle_group: string | null; sets: number; reps: number; weight: number; unit: string }[];
}
export interface TraineePR { exercise_name: string; best_weight: number; best_reps: number; achieved_date: string; unit: string; }
export interface TraineeRun { id: number; run_ts: number; distance: number; duration: number; pace: number; }
export interface TraineeWeight { date: string; weight: number; unit: string; }

export interface TraineeDashboard {
  link: CoachLink;
  name: string;
  sex: 'male' | 'female';
  workouts: Section<TraineeWorkout[]>;
  prs: Section<TraineePR[]>;
  runs: Section<TraineeRun[]>;
  bodyWeight: Section<TraineeWeight[]>;
  recovery: Section<number | null>;   // latest recovery %
  sleep: Section<number | null>;      // latest sleep hours
  strain: Section<number | null>;     // latest day strain
}

function on(link: CoachLink, scope: ScopeKey): boolean {
  return !!link.shared_scopes?.[scope];
}

// Pull the latest numeric value out of a WHOOP cache payload defensively — the
// cache stores raw API responses whose shape varies, so every access is guarded.
function latestFromCache(rows: { cache_key: string; data: any }[] | null, pick: (rec: any) => number | null): number | null {
  if (!rows?.length) return null;
  for (const row of rows) {
    const records = row?.data?.records ?? row?.data ?? [];
    const list = Array.isArray(records) ? records : [];
    for (const rec of list) {
      const v = pick(rec);
      if (v != null && Number.isFinite(v)) return Math.round(v * 10) / 10;
    }
  }
  return null;
}

export async function getTraineeDashboard(traineeId: string): Promise<TraineeDashboard | null> {
  const link = (await getSentLinks()).find((l) => l.trainee_id === traineeId && l.status === 'accepted');
  if (!link) return null;

  // Fire only the shared queries; unshared sections resolve to empty instantly.
  const wantWorkouts = on(link, 'workouts');
  const wantPRs = on(link, 'prs');
  const wantRuns = on(link, 'runs');
  const wantBW = on(link, 'body_weight');
  const wantRec = on(link, 'recovery');
  const wantSleep = on(link, 'sleep');
  const wantStrain = on(link, 'strain');

  const [profileRes, workoutRes, prRes, runRes, bwRes, recRes, sleepRes, strainRes] = await Promise.all([
    supabase.from('profiles').select('full_name, trainer_display_name, sex').eq('id', traineeId).maybeSingle(),
    wantWorkouts
      ? supabase.from('workouts')
          .select('id, date, title, duration_minutes, muscle_groups, source_plan_id, exercises(name, muscle_group, sets, reps, weight, unit)')
          .eq('user_id', traineeId).order('date', { ascending: false }).limit(60)
      : Promise.resolve({ data: null }),
    wantPRs
      ? supabase.from('personal_records').select('exercise_name, best_weight, best_reps, achieved_date, unit')
          .eq('user_id', traineeId).order('achieved_date', { ascending: false }).limit(40)
      : Promise.resolve({ data: null }),
    wantRuns
      ? supabase.from('runs').select('id, run_ts, distance, duration, pace')
          .eq('user_id', traineeId).order('run_ts', { ascending: false }).limit(30)
      : Promise.resolve({ data: null }),
    wantBW
      ? supabase.from('body_weight_logs').select('date, weight, unit')
          .eq('user_id', traineeId).order('date', { ascending: true }).limit(120)
      : Promise.resolve({ data: null }),
    wantRec
      ? supabase.from('whoop_cache').select('cache_key, data').eq('user_id', traineeId).like('cache_key', 'recovery:%')
      : Promise.resolve({ data: null }),
    wantSleep
      ? supabase.from('whoop_cache').select('cache_key, data').eq('user_id', traineeId).like('cache_key', 'sleep:%')
      : Promise.resolve({ data: null }),
    wantStrain
      ? supabase.from('whoop_cache').select('cache_key, data').eq('user_id', traineeId).like('cache_key', 'cycles:%')
      : Promise.resolve({ data: null }),
  ]);

  const name = link.trainee_name || (profileRes as any)?.data?.full_name || link.invited_email;
  const sex: 'male' | 'female' = (profileRes as any)?.data?.sex === 'female' ? 'female' : 'male';

  return {
    link,
    name,
    sex,
    workouts: { shared: wantWorkouts, data: ((workoutRes as any).data ?? []) as TraineeWorkout[] },
    prs: { shared: wantPRs, data: ((prRes as any).data ?? []) as TraineePR[] },
    runs: { shared: wantRuns, data: ((runRes as any).data ?? []) as TraineeRun[] },
    bodyWeight: { shared: wantBW, data: ((bwRes as any).data ?? []) as TraineeWeight[] },
    recovery: { shared: wantRec, data: latestFromCache((recRes as any).data, (r) => r?.score?.recovery_score ?? r?.recovery_score ?? null) },
    sleep: { shared: wantSleep, data: latestFromCache((sleepRes as any).data, (r) => {
      const ms = r?.score?.stage_summary?.total_in_bed_time_milli ?? r?.total_in_bed_time_milli ?? null;
      return ms != null ? ms / 3_600_000 : (r?.sleep_hours ?? null);
    }) },
    strain: { shared: wantStrain, data: latestFromCache((strainRes as any).data, (r) => r?.score?.strain ?? r?.strain ?? null) },
  };
}

export interface RosterStatus { lastDate: string | null; daysAgo: number | null; weekSessions: number; }

// One batched read of every trainee's recent workout dates (RLS returns only the
// ones who share 'workouts'), folded into a last-active + this-week count per
// trainee — so the roster can flag who's gone quiet without N round-trips.
export async function getRosterStatus(traineeIds: string[]): Promise<Record<string, RosterStatus>> {
  const out: Record<string, RosterStatus> = {};
  for (const id of traineeIds) out[id] = { lastDate: null, daysAgo: null, weekSessions: 0 };
  if (!traineeIds.length) return out;

  const { data } = await supabase
    .from('workouts')
    .select('user_id, date')
    .in('user_id', traineeIds)
    .order('date', { ascending: false })
    .limit(600);

  const now = Date.now();
  const week: Record<string, Set<string>> = {};
  for (const row of (data ?? []) as { user_id: string; date: string }[]) {
    const s = out[row.user_id];
    if (!s) continue;
    const t = new Date(`${row.date}T00:00:00`).getTime();
    if (!s.lastDate) { s.lastDate = row.date; s.daysAgo = Math.floor((now - t) / 86_400_000); }
    if (now - t <= 7 * 86_400_000) (week[row.user_id] ??= new Set()).add(row.date);
  }
  for (const id of traineeIds) out[id].weekSessions = week[id]?.size ?? 0;
  return out;
}

export { SHARE_SCOPES };
