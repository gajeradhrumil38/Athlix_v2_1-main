// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_CLIENT_ID = Deno.env.get('WHOOP_CLIENT_ID')!;
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET')!;
const MODEL_VERSION = 'deterministic-v1';
const TIME_ZONE = 'America/Los_Angeles';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Muscle = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Legs' | 'Glutes' | 'Hamstrings' | 'Calves' | 'Core' | 'Cardio' | 'Mobility' | 'Forearms';
type RecType = 'push' | 'pull' | 'legs' | 'upper' | 'core' | 'cardio' | 'mobility' | 'rest';
type Intensity = 'heavy' | 'moderate' | 'light' | 'recovery' | 'rest';
type ReadinessTier = 'green' | 'yellow' | 'red' | 'unknown';

type ParsedRecovery = { date: string; recovery_score: number; hrv_rmssd_milli: number; resting_heart_rate: number };
type ParsedSleep = { date: string; sleep_performance_percentage: number; total_in_bed_time_milli: number };
type ParsedCycle = { date: string; strain_score: number | null; average_heart_rate?: number; max_heart_rate?: number };
type ParsedWorkout = { date: string; strain: number | null; max_heart_rate?: number };
type GymWorkout = {
  id: string;
  title: string;
  date: string;
  duration_minutes: number | null;
  muscle_groups: string[] | null;
  exercises?: Array<{ name: string; muscle_group: string | null; sets: number; reps: number; weight: number; unit: string | null }>;
};

type MuscleState = Record<string, {
  last_trained_days: number;
  sets_7d: number;
  sets_28d: number;
  volume_7d: number;
  volume_28d: number;
}>;

type Candidate = {
  type: RecType;
  title: string;
  muscles: Muscle[];
  base: number;
  score: number;
  reasons: Array<{ label: string; detail: string; impact: 'positive' | 'negative' | 'neutral' }>;
};

const PUSH: Muscle[] = ['Chest', 'Shoulders', 'Triceps'];
const PULL: Muscle[] = ['Back', 'Biceps', 'Forearms'];
const LEGS: Muscle[] = ['Legs', 'Glutes', 'Hamstrings', 'Calves'];
const CORE: Muscle[] = ['Core'];
const CARDIO: Muscle[] = ['Cardio'];
const MOBILITY: Muscle[] = ['Mobility'];
const ALL_MUSCLES: Muscle[] = [...PUSH, ...PULL, ...LEGS, ...CORE, ...CARDIO, ...MOBILITY];

const OPTIMAL_REST_DAYS: Record<string, number> = {
  Chest: 2, Back: 2, Shoulders: 2, Biceps: 2, Triceps: 2, Forearms: 1,
  Legs: 3, Glutes: 3, Hamstrings: 3, Calves: 2, Core: 1, Cardio: 1, Mobility: 0,
};

const EXERCISES: Record<RecType, Array<{ name: string; sets: number; reps: string }>> = {
  push: [
    { name: 'Bench Press', sets: 3, reps: '5-8' },
    { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
    { name: 'Lateral Raise', sets: 3, reps: '12-15' },
  ],
  pull: [
    { name: 'Lat Pulldown', sets: 3, reps: '8-10' },
    { name: 'Seated Cable Row', sets: 3, reps: '8-12' },
    { name: 'Face Pull', sets: 3, reps: '12-15' },
  ],
  legs: [
    { name: 'Squat', sets: 3, reps: '5-8' },
    { name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
    { name: 'Leg Press', sets: 3, reps: '10-12' },
  ],
  upper: [
    { name: 'Dumbbell Bench Press', sets: 3, reps: '8-10' },
    { name: 'Single Arm Dumbbell Row', sets: 3, reps: '8-10' },
    { name: 'Cable Face Pull', sets: 2, reps: '12-15' },
  ],
  core: [
    { name: 'Plank', sets: 3, reps: '45-60s' },
    { name: 'Hanging Knee Raise', sets: 3, reps: '8-12' },
    { name: 'Pallof Press', sets: 3, reps: '10-12' },
  ],
  cardio: [
    { name: 'Zone 2 Cardio', sets: 1, reps: '25-40 min' },
    { name: 'Incline Walk', sets: 1, reps: '15-20 min' },
  ],
  mobility: [
    { name: 'Hip Mobility Flow', sets: 1, reps: '8-10 min' },
    { name: 'Thoracic Rotation', sets: 2, reps: '8/side' },
    { name: 'Foam Rolling', sets: 1, reps: '5-8 min' },
  ],
  rest: [
    { name: 'Rest Day', sets: 1, reps: 'walk + hydrate' },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function datePartsInTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '01';
  return { year: value('year'), month: value('month'), day: value('day') };
}

function todayKey() {
  const { year, month, day } = datePartsInTz();
  return `${year}-${month}-${day}`;
}

function addDays(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(today: string, past: string) {
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${past}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

function isoRange(days: number) {
  const endDate = todayKey();
  const startDate = addDays(endDate, -(days - 1));
  return {
    startDate,
    endDate,
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
  };
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function parseWhoopDate(value: unknown) {
  if (!value) return '';
  return new Date(String(value)).toISOString().slice(0, 10);
}

function parseRecovery(raw: any): ParsedRecovery[] {
  return ((raw?.records ?? []) as any[])
    .filter((r) => r.score_state === 'SCORED')
    .map((r) => ({
      date: parseWhoopDate(r.created_at),
      recovery_score: Number(r.score?.recovery_score ?? 0),
      hrv_rmssd_milli: Number(r.score?.hrv_rmssd_milli ?? 0),
      resting_heart_rate: Number(r.score?.resting_heart_rate ?? 0),
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseSleep(raw: any): ParsedSleep[] {
  return ((raw?.records ?? []) as any[])
    .filter((r) => !r.nap && (r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE'))
    .map((r) => ({
      date: parseWhoopDate(r.start),
      sleep_performance_percentage: Number(r.score?.sleep_performance_percentage ?? 0),
      total_in_bed_time_milli: Number(r.score?.stage_summary?.total_in_bed_time_milli ?? 0),
    }))
    .filter((s) => s.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseCycles(raw: any): ParsedCycle[] {
  return ((raw?.records ?? []) as any[])
    .map((r) => ({
      date: parseWhoopDate(r.start),
      strain_score: Number.isFinite(Number(r.score?.strain)) ? Number(r.score.strain) : null,
      average_heart_rate: r.score?.average_heart_rate,
      max_heart_rate: r.score?.max_heart_rate,
    }))
    .filter((c) => c.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseWhoopWorkouts(raw: any): ParsedWorkout[] {
  return ((raw?.records ?? []) as any[])
    .filter((r) => r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE')
    .map((r) => ({
      date: parseWhoopDate(r.start),
      strain: Number.isFinite(Number(r.score?.strain)) ? Number(r.score.strain) : null,
      max_heart_rate: r.score?.max_heart_rate,
    }))
    .filter((w) => w.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

type SyncActivity = {
  whoop_id: number; date: string; sport_id: number | null; sport_name: string;
  started_at: string; ended_at: string; strain: number | null;
  average_heart_rate: number | null; max_heart_rate: number | null;
  kilojoules: number | null; distance_meter: number | null; zones: Record<string, number>;
};

const SPORT_NAMES: Record<number, string> = {
  0: 'Activity', 1: 'Running', 16: 'Cycling', 35: 'Swimming', 44: 'Walking',
  45: 'Weight Training', 63: 'Hiking', 71: 'CrossFit', 126: 'Yoga', 127: 'Pilates',
  169: 'HIIT', 189: 'Rowing', 190: 'Elliptical', 231: 'Jump Rope', 232: 'Rock Climbing',
  257: 'Pickleball', 264: 'Dance', 268: 'Jiu Jitsu', 269: 'Triathlon',
};

function parseSyncActivities(raw: any): SyncActivity[] {
  return ((raw?.records ?? []) as any[])
    .filter((r) => r.id != null && (r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE'))
    .map((r) => {
      const s = r.score ?? {};
      const z = s.zone_duration ?? {};
      return {
        whoop_id: Number(r.id),
        date: parseWhoopDate(r.start),
        sport_id: r.sport_id != null ? Number(r.sport_id) : null,
        sport_name: SPORT_NAMES[Number(r.sport_id)] ?? 'Workout',
        started_at: String(r.start),
        ended_at: String(r.end),
        strain: Number.isFinite(Number(s.strain)) ? Number(s.strain) : null,
        average_heart_rate: s.average_heart_rate ?? null,
        max_heart_rate: s.max_heart_rate ?? null,
        kilojoules: s.kilojoule ?? null,
        distance_meter: s.distance_meter ?? null,
        zones: {
          zone_zero: z.zone_zero_milli ?? 0, zone_one: z.zone_one_milli ?? 0,
          zone_two: z.zone_two_milli ?? 0, zone_three: z.zone_three_milli ?? 0,
          zone_four: z.zone_four_milli ?? 0, zone_five: z.zone_five_milli ?? 0,
        },
      };
    })
    .filter((a) => a.date && a.whoop_id);
}

async function syncWhoopActivities(sb: any, userId: string, rawWorkouts: any): Promise<number> {
  const activities = parseSyncActivities(rawWorkouts);
  if (!activities.length) return 0;
  const rows = activities.map((a) => ({ user_id: userId, ...a, synced_at: new Date().toISOString() }));
  const { error } = await sb.from('whoop_activities').upsert(rows, { onConflict: 'user_id,whoop_id' });
  if (error) { console.error('whoop_activities upsert failed:', error.message); return 0; }
  return rows.length;
}

async function resolveWhoopToken(sb: any, userId: string): Promise<string | null> {
  const { data: row } = await sb
    .from('whoop_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) return null;
  let accessToken = row.access_token as string;
  const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : Infinity;

  if (Date.now() >= expiresAt - 5 * 60 * 1000 && row.refresh_token) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token as string,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
      }),
    });
    if (res.ok) {
      const token = await res.json() as any;
      accessToken = token.access_token;
      await sb.from('whoop_tokens').upsert({
        user_id: userId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? row.refresh_token,
        expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      });
    }
  }

  return accessToken;
}

async function whoopGet(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { records: [] };
  if (!res.ok) throw new Error(`WHOOP API ${res.status}`);
  return res.json().catch(() => ({ records: [] }));
}

async function getWhoopData(sb: any, userId: string, force: boolean) {
  const { start, end } = isoRange(28);
  const suffix = `${start}:${end}`;
  const keys = [`recovery:${suffix}`, `sleep:${suffix}`, `cycles:${suffix}`, `workouts:${suffix}`];
  const cacheTtlMs = 60 * 60 * 1000;

  const fresh = new Map<string, any>();
  const stale: string[] = [];

  if (!force) {
    const { data: rows } = await sb
      .from('whoop_cache')
      .select('cache_key, data, fetched_at')
      .eq('user_id', userId)
      .in('cache_key', keys);

    for (const key of keys) {
      const row = (rows ?? []).find((r: any) => r.cache_key === key);
      if (row && Date.now() - new Date(row.fetched_at).getTime() < cacheTtlMs) {
        fresh.set(key, row.data);
      } else {
        stale.push(key);
      }
    }
  } else {
    stale.push(...keys);
  }

  if (stale.length) {
    const token = await resolveWhoopToken(sb, userId);
    if (token) {
      // WHOOP v2 caps `limit` at 25 — a higher value 400s. Fetch each endpoint
      // independently so one failure degrades that stream to empty instead of
      // nuking ALL WHOOP data (which silently zeroed readiness/load before).
      const paths: Record<string, string> = {
        [`recovery:${suffix}`]: `/v2/recovery?start=${start}&end=${end}&limit=25`,
        [`sleep:${suffix}`]: `/v2/activity/sleep?start=${start}&end=${end}&limit=25`,
        [`cycles:${suffix}`]: `/v2/cycle?start=${start}&end=${end}&limit=25`,
        [`workouts:${suffix}`]: `/v2/activity/workout?start=${start}&end=${end}&limit=25`,
      };

      await Promise.all(stale.map(async (key) => {
        try {
          const data = await whoopGet(token, paths[key]);
          fresh.set(key, data);
          await sb.from('whoop_cache').upsert({
            user_id: userId,
            cache_key: key,
            data,
            fetched_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`WHOOP fetch failed for ${key}:`, err instanceof Error ? err.message : err);
        }
      }));
    }
  }

  return {
    recovery: parseRecovery(fresh.get(`recovery:${suffix}`)),
    sleep: parseSleep(fresh.get(`sleep:${suffix}`)),
    cycles: parseCycles(fresh.get(`cycles:${suffix}`)),
    workouts: parseWhoopWorkouts(fresh.get(`workouts:${suffix}`)),
    rawWorkouts: fresh.get(`workouts:${suffix}`) ?? { records: [] },
    fromCache: stale.length === 0,
  };
}

async function getGymData(sb: any, userId: string) {
  const today = todayKey();
  const start = addDays(today, -41);
  const { data, error } = await sb
    .from('workouts')
    .select('id,title,date,duration_minutes,muscle_groups,exercises(name,muscle_group,sets,reps,weight,unit)')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', today)
    .order('date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as GymWorkout[];
}

function normalizeMuscle(input: unknown): Muscle | null {
  const value = String(input ?? '').toLowerCase().trim();
  if (!value) return null;
  if (value.includes('chest')) return 'Chest';
  if (value.includes('back') || value.includes('lat') || value.includes('trap')) return 'Back';
  if (value.includes('shoulder') || value.includes('delt')) return 'Shoulders';
  if (value.includes('bicep')) return 'Biceps';
  if (value.includes('tricep')) return 'Triceps';
  if (value.includes('glute')) return 'Glutes';
  if (value.includes('hamstring')) return 'Hamstrings';
  if (value.includes('calf')) return 'Calves';
  if (value.includes('leg') || value.includes('quad')) return 'Legs';
  if (value.includes('core') || value.includes('abs')) return 'Core';
  if (value.includes('cardio') || value.includes('run') || value.includes('cycle')) return 'Cardio';
  if (value.includes('mobility') || value.includes('yoga')) return 'Mobility';
  if (value.includes('forearm') || value.includes('grip')) return 'Forearms';
  return null;
}

function emptyMuscleState(): MuscleState {
  return Object.fromEntries(ALL_MUSCLES.map((m) => [m, {
    last_trained_days: 99,
    sets_7d: 0,
    sets_28d: 0,
    volume_7d: 0,
    volume_28d: 0,
  }])) as MuscleState;
}

function buildMuscleState(workouts: GymWorkout[], today: string): MuscleState {
  const state = emptyMuscleState();

  for (const workout of workouts) {
    const age = daysBetween(today, workout.date);
    const touched = new Set<Muscle>();

    for (const rawGroup of workout.muscle_groups ?? []) {
      const muscle = normalizeMuscle(rawGroup);
      if (muscle) touched.add(muscle);
    }

    for (const ex of workout.exercises ?? []) {
      const muscle = normalizeMuscle(ex.muscle_group) ?? normalizeMuscle(ex.name);
      if (!muscle) continue;
      touched.add(muscle);
      const sets = Math.max(0, Number(ex.sets) || 0);
      const reps = Math.max(0, Number(ex.reps) || 0);
      const weight = Math.max(0, Number(ex.weight) || 0);
      const unit = String(ex.unit ?? 'lbs');
      const volume = unit === 'kg' || unit === 'lbs' ? sets * reps * weight : 0;

      if (age <= 6) {
        state[muscle].sets_7d += sets;
        state[muscle].volume_7d += volume;
      }
      if (age <= 27) {
        state[muscle].sets_28d += sets;
        state[muscle].volume_28d += volume;
      }
    }

    for (const muscle of touched) {
      state[muscle].last_trained_days = Math.min(state[muscle].last_trained_days, age);
    }
  }

  return state;
}

function computeLoad(cycles: ParsedCycle[]) {
  const today = todayKey();
  const loads = Array.from({ length: 28 }).map((_, i) => {
    const date = addDays(today, i - 27);
    const cycle = cycles.find((c) => c.date === date && c.strain_score != null);
    return { date, load: cycle?.strain_score ?? 0, observed: Boolean(cycle) };
  });
  const observed = (n: number) => loads.slice(-n).filter((l) => l.observed).map((l) => l.load);
  const acute = observed(7);
  const chronic = observed(28);
  const acuteLoad = mean(acute);
  const chronicLoad = mean(chronic);
  const hasBaseline = acute.length >= 3 && chronic.length >= 7 && chronicLoad > 0;
  const acwr = hasBaseline ? acuteLoad / chronicLoad : null;
  const sd = stdDev(acute);
  const monotony = acute.length >= 4 && sd > 0 ? mean(acute) / sd : null;
  const yesterday = loads[loads.length - 2]?.load ?? null;
  const todayStrain = loads[loads.length - 1]?.load ?? null;
  const coverage = chronic.length / 28;

  return { acwr, acuteLoad, chronicLoad, monotony, yesterdayStrain: yesterday, todayStrain, observedDays: chronic.length, coverage, hasBaseline };
}

function latestByDate<T extends { date: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function recentVsBaseline(values: Array<{ date: string; value: number }>) {
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date)).map((v) => v.value);
  const recent = sorted.slice(-7);
  const baseline = sorted.slice(-28, -7);
  return {
    recent: recent.length ? mean(recent) : null,
    delta: recent.length && baseline.length ? mean(recent) - mean(baseline) : 0,
    baselineDays: baseline.length,
  };
}

function computeReadiness(recovery: ParsedRecovery[], sleep: ParsedSleep[], load: ReturnType<typeof computeLoad>) {
  const latestRecovery = latestByDate(recovery);
  const latestSleep = latestByDate(sleep);
  const hrvTrend = recentVsBaseline(recovery.filter((r) => r.hrv_rmssd_milli > 0).map((r) => ({ date: r.date, value: r.hrv_rmssd_milli })));
  const rhrTrend = recentVsBaseline(recovery.filter((r) => r.resting_heart_rate > 0).map((r) => ({ date: r.date, value: r.resting_heart_rate })));

  let score = latestRecovery?.recovery_score ?? 55;
  const sleepScore = latestSleep?.sleep_performance_percentage ?? null;
  if (sleepScore != null && sleepScore > 0) score = score * 0.75 + sleepScore * 0.25;
  if (hrvTrend.baselineDays >= 7 && hrvTrend.delta < -8) score -= 8;
  if (rhrTrend.baselineDays >= 7 && rhrTrend.delta > 4) score -= 8;
  if (load.acwr != null && load.acwr > 1.5) score -= 10;
  if ((load.yesterdayStrain ?? 0) >= 16) score -= 7;

  score = clamp(score);
  const tier: ReadinessTier = latestRecovery == null && latestSleep == null
    ? 'unknown'
    : score >= 67 ? 'green'
      : score >= 40 ? 'yellow'
        : 'red';

  return {
    score,
    tier,
    recoveryScore: latestRecovery?.recovery_score ?? null,
    sleepPerformance: sleepScore,
    hrv: latestRecovery?.hrv_rmssd_milli ?? null,
    rhr: latestRecovery?.resting_heart_rate ?? null,
    hrvDelta: hrvTrend.delta,
    rhrDelta: rhrTrend.delta,
  };
}

function groupDueScore(muscles: Muscle[], state: MuscleState) {
  const scores = muscles.map((m) => {
    const age = state[m]?.last_trained_days ?? 99;
    const optimal = OPTIMAL_REST_DAYS[m] ?? 2;
    return clamp(((age - optimal + 1) / 5) * 100);
  });
  return mean(scores);
}

function groupFreshPenalty(muscles: Muscle[], state: MuscleState) {
  const newest = Math.min(...muscles.map((m) => state[m]?.last_trained_days ?? 99));
  if (newest === 0) return 55;
  if (newest === 1) return 25;
  return 0;
}

function createCandidates(state: MuscleState): Candidate[] {
  return [
    { type: 'push', title: 'Push Day', muscles: PUSH, base: 0, score: 0, reasons: [] },
    { type: 'pull', title: 'Pull Day', muscles: PULL, base: 0, score: 0, reasons: [] },
    { type: 'legs', title: 'Leg Day', muscles: LEGS, base: 0, score: 0, reasons: [] },
    { type: 'upper', title: 'Upper Balance', muscles: ['Chest', 'Back', 'Shoulders'], base: 0, score: 0, reasons: [] },
    { type: 'core', title: 'Core Session', muscles: CORE, base: 0, score: 0, reasons: [] },
    { type: 'cardio', title: 'Zone 2 Cardio', muscles: CARDIO, base: 0, score: 0, reasons: [] },
    { type: 'mobility', title: 'Mobility Reset', muscles: MOBILITY, base: 0, score: 0, reasons: [] },
    { type: 'rest', title: 'Recovery Day', muscles: [], base: 0, score: 0, reasons: [] },
  ].map((c) => ({ ...c, base: groupDueScore(c.muscles.length ? c.muscles : MOBILITY, state) })) as Candidate[];
}

function scoreCandidates(candidates: Candidate[], state: MuscleState, readiness: ReturnType<typeof computeReadiness>, load: ReturnType<typeof computeLoad>) {
  const chestSets = state.Chest?.sets_7d ?? 0;
  const backSets = state.Back?.sets_7d ?? 0;
  const legSets = (state.Legs?.sets_7d ?? 0) + (state.Glutes?.sets_7d ?? 0) + (state.Hamstrings?.sets_7d ?? 0);
  const upperSets = chestSets + backSets + (state.Shoulders?.sets_7d ?? 0);
  const highLoadRisk = load.acwr != null && load.acwr > 1.5;
  const cautionLoad = load.acwr != null && load.acwr > 1.3;

  for (const c of candidates) {
    let score = c.base;
    c.reasons.push({ label: 'Muscle readiness', detail: `${Math.round(c.base)} due score from days since trained`, impact: 'positive' });

    const freshPenalty = groupFreshPenalty(c.muscles, state);
    score -= freshPenalty;
    if (freshPenalty) c.reasons.push({ label: 'Recent training', detail: 'One target area was trained in the last 24-48 hours', impact: 'negative' });

    if (readiness.tier === 'green') {
      if (!['rest', 'mobility'].includes(c.type)) score += 18;
      c.reasons.push({ label: 'Readiness', detail: `Readiness score ${Math.round(readiness.score)} supports training`, impact: 'positive' });
    } else if (readiness.tier === 'yellow') {
      if (['rest', 'mobility', 'cardio', 'core'].includes(c.type)) score += 10;
      if (['push', 'pull', 'legs', 'upper'].includes(c.type)) score -= 6;
      c.reasons.push({ label: 'Readiness', detail: `Readiness score ${Math.round(readiness.score)} favors controlled intensity`, impact: 'neutral' });
    } else if (readiness.tier === 'red') {
      if (['rest', 'mobility'].includes(c.type)) score += 55;
      if (['push', 'pull', 'legs', 'upper'].includes(c.type)) score -= 35;
      c.reasons.push({ label: 'Readiness', detail: `Readiness score ${Math.round(readiness.score)} favors recovery`, impact: 'negative' });
    }

    if (highLoadRisk) {
      if (['rest', 'mobility'].includes(c.type)) score += 35;
      if (['push', 'pull', 'legs', 'upper'].includes(c.type)) score -= 30;
      c.reasons.push({ label: 'Training load', detail: `ACWR ${load.acwr?.toFixed(2)} is high risk`, impact: 'negative' });
    } else if (cautionLoad) {
      if (['push', 'pull', 'legs', 'upper'].includes(c.type)) score -= 12;
      if (['mobility', 'cardio'].includes(c.type)) score += 10;
      c.reasons.push({ label: 'Training load', detail: `ACWR ${load.acwr?.toFixed(2)} says hold load steady`, impact: 'neutral' });
    } else if (load.acwr != null && load.acwr < 0.8 && !['rest', 'mobility'].includes(c.type)) {
      score += 10;
      c.reasons.push({ label: 'Training load', detail: `ACWR ${load.acwr.toFixed(2)} leaves room to build`, impact: 'positive' });
    }

    if (c.type === 'pull' && chestSets > Math.max(2, backSets * 1.5)) {
      score += 24;
      c.reasons.push({ label: 'Balance', detail: `${chestSets} chest sets vs ${backSets} back sets this week`, impact: 'positive' });
    }
    if (c.type === 'legs' && upperSets >= 8 && legSets < 4) {
      score += 22;
      c.reasons.push({ label: 'Balance', detail: 'Upper body volume is ahead of legs this week', impact: 'positive' });
    }
    if (c.type === 'core' && (state.Core?.last_trained_days ?? 99) > 2) score += 8;

    c.score = Math.round(clamp(score, 0, 100));
    c.reasons = c.reasons
      .sort((a, b) => ({ positive: 0, neutral: 1, negative: 2 }[a.impact] - { positive: 0, neutral: 1, negative: 2 }[b.impact]))
      .slice(0, 4);
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function pickIntensity(type: RecType, readiness: ReturnType<typeof computeReadiness>, load: ReturnType<typeof computeLoad>): Intensity {
  if (type === 'rest') return 'rest';
  if (type === 'mobility') return 'recovery';
  if (readiness.tier === 'red') return 'recovery';
  if ((load.acwr ?? 1) > 1.5) return 'light';
  if (readiness.tier === 'yellow' || (load.acwr ?? 1) > 1.3) return 'moderate';
  if (readiness.tier === 'green' && ['push', 'pull', 'legs'].includes(type)) return 'heavy';
  return 'moderate';
}

function adjustExercises(type: RecType, intensity: Intensity) {
  return (EXERCISES[type] ?? EXERCISES.mobility).map((ex) => ({
    ...ex,
    sets: intensity === 'heavy' ? ex.sets : intensity === 'moderate' ? Math.max(2, ex.sets) : Math.min(2, ex.sets),
  }));
}

function confidenceScore(whoop: Awaited<ReturnType<typeof getWhoopData>>, gym: GymWorkout[], load: ReturnType<typeof computeLoad>) {
  const whoopScore = whoop.recovery.length || whoop.cycles.length ? 0.45 : 0;
  const loadScore = load.observedDays >= 21 ? 0.25 : load.observedDays >= 10 ? 0.16 : load.observedDays >= 3 ? 0.08 : 0;
  const gymScore = gym.length >= 8 ? 0.25 : gym.length >= 3 ? 0.16 : gym.length >= 1 ? 0.08 : 0;
  return Math.min(1, whoopScore + loadScore + gymScore + 0.05);
}

async function generateRecommendation(sb: any, userId: string, forceWhoop: boolean) {
  const date = todayKey();
  const [whoop, gym] = await Promise.all([
    getWhoopData(sb, userId, forceWhoop).catch(() => ({ recovery: [], sleep: [], cycles: [], workouts: [], rawWorkouts: { records: [] }, fromCache: false })),
    getGymData(sb, userId),
  ]);

  // Persist WHOOP activities (non-fatal) so the app has durable per-activity
  // history and the strain-cost model has training data.
  const activitiesSynced = await syncWhoopActivities(sb, userId, (whoop as any).rawWorkouts ?? { records: [] }).catch(() => 0);

  const muscleState = buildMuscleState(gym, date);
  const load = computeLoad(whoop.cycles);
  const readiness = computeReadiness(whoop.recovery, whoop.sleep, load);
  const ranked = scoreCandidates(createCandidates(muscleState), muscleState, readiness, load);
  const best = ranked[0] ?? createCandidates(muscleState)[0];
  const intensity = pickIntensity(best.type, readiness, load);
  const exercises = adjustExercises(best.type, intensity);
  const confidence = confidenceScore(whoop, gym, load);

  const snapshot = {
    user_id: userId,
    date,
    readiness,
    training_load: load,
    muscle_state: muscleState,
    gym: {
      workouts_42d: gym.length,
      workouts_7d: gym.filter((w) => daysBetween(date, w.date) <= 6).length,
    },
    whoop: {
      recovery_days: whoop.recovery.length,
      sleep_days: whoop.sleep.length,
      cycle_days: whoop.cycles.length,
      activities_synced: activitiesSynced,
      from_cache: whoop.fromCache,
    },
    data_quality: {
      confidence,
      whoop_connected: whoop.recovery.length > 0 || whoop.cycles.length > 0,
      load_observed_days: load.observedDays,
      gym_sessions: gym.length,
    },
    model_version: MODEL_VERSION,
  };

  const { data: snapshotRow, error: snapshotError } = await sb
    .from('athlete_daily_snapshots')
    .upsert(snapshot, { onConflict: 'user_id,date' })
    .select('id')
    .single();
  if (snapshotError) throw snapshotError;

  const recommendation = {
    user_id: userId,
    date,
    snapshot_id: snapshotRow.id,
    title: best.title,
    recommendation_type: best.type,
    intensity,
    readiness_tier: readiness.tier,
    muscles: best.muscles,
    exercises,
    reasons: best.reasons,
    alternatives: ranked.slice(1, 4).map((c) => ({
      type: c.type,
      title: c.title,
      score: c.score,
      muscles: c.muscles,
      reason: c.reasons[0]?.detail ?? 'Secondary option',
    })),
    score: best.score,
    confidence,
    model_version: MODEL_VERSION,
  };

  const { data: recRow, error: recError } = await sb
    .from('training_recommendations')
    .upsert(recommendation, { onConflict: 'user_id,date' })
    .select('*')
    .single();
  if (recError) throw recError;

  return { recommendation: recRow, snapshot: { id: snapshotRow.id, ...snapshot } };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const jwt = auth.replace('Bearer ', '');
  const { data: { user }, error: authError } = await sb.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body.action ?? 'today';
  const date = todayKey();

  try {
    if (action === 'feedback') {
      const { data, error } = await sb.from('recommendation_feedback').insert({
        user_id: user.id,
        recommendation_id: body.recommendation_id ?? null,
        date: body.date ?? date,
        action: body.feedback_action ?? 'accepted',
        chosen_muscles: body.chosen_muscles ?? [],
        completed_workout_id: body.completed_workout_id ?? null,
        notes: body.notes ?? null,
      }).select('*').single();
      if (error) throw error;
      return json({ feedback: data });
    }

    if (!body.force) {
      const { data: existing } = await sb
        .from('training_recommendations')
        .select('*, athlete_daily_snapshots(*)')
        .eq('user_id', user.id)
        .eq('date', date)
        .maybeSingle();
      if (existing) return json({ recommendation: existing, generated: false });
    }

    const result = await generateRecommendation(sb, user.id, Boolean(body.force_whoop));
    return json({ ...result, generated: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Recommendation failed' }, 500);
  }
});
