import { format } from 'date-fns';
import type { WhoopRecovery, WhoopSleep, WhoopCycle, WhoopWorkout } from '../types';
import { supabase } from '../../../lib/supabase';

const EDGE_FN = 'https://mrntwydykqsdawpklumf.supabase.co/functions/v1';
const WHOOP_CLIENT_ID = 'd00b485b-7052-4a22-ad29-c57ab43f0817';
const WHOOP_REDIRECT_URI = `${EDGE_FN}/whoop-oauth`;
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_SCOPES = 'offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement';

// ── localStorage cache (survives page reload) ──────────────────
const LS_PREFIX = 'whoop_cache:';
const LS_TTL_MS = 10 * 60 * 1000; // 10 min — server cache is 15 min, so always slightly stale

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > LS_TTL_MS) { localStorage.removeItem(LS_PREFIX + key); return null; }
    return data;
  } catch { return null; }
}

function lsSet(key: string, data: unknown) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
}

function lsClear() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ── Raw WHOOP API response parsers ─────────────────────────────
function parseRecovery(raw: { records?: unknown[] }): WhoopRecovery[] {
  return ((raw?.records ?? []) as Record<string, unknown>[])
    .filter((r) => (r.score_state as string) === 'SCORED')
    .map((r) => {
      const score = r.score as Record<string, number>;
      return {
        date: format(new Date(r.created_at as string), 'yyyy-MM-dd'),
        recovery_score: score?.recovery_score ?? 0,
        hrv_rmssd_milli: score?.hrv_rmssd_milli ?? 0,
        resting_heart_rate: score?.resting_heart_rate ?? 0,
        spo2_percentage: score?.spo2_percentage,
        skin_temp_celsius: score?.skin_temp_celsius,
      };
    });
}

function parseSleep(raw: { records?: unknown[] }): WhoopSleep[] {
  return ((raw?.records ?? []) as Record<string, unknown>[])
    .filter((r) => !r.nap && (r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE'))
    .map((r) => {
      const score = r.score as Record<string, unknown>;
      const stages = score?.stage_summary as Record<string, number> | undefined;
      return {
        date: format(new Date(r.start as string), 'yyyy-MM-dd'),
        sleep_performance_percentage: (score?.sleep_performance_percentage as number) ?? 0,
        sleep_efficiency_percentage: (score?.sleep_efficiency_percentage as number) ?? 0,
        total_in_bed_time_milli: stages?.total_in_bed_time_milli ?? 0,
        total_slow_wave_sleep_time_milli: stages?.total_slow_wave_sleep_time_milli,
        total_rem_sleep_time_milli: stages?.total_rem_sleep_time_milli,
      };
    });
}

function parseCycles(raw: { records?: unknown[] }): WhoopCycle[] {
  return ((raw?.records ?? []) as Record<string, unknown>[]).map((r) => {
    const score = r.score as Record<string, number> | undefined;
    const kj = score?.kilojoule ?? 0;
    return {
      date: format(new Date(r.start as string), 'yyyy-MM-dd'),
      estimated_steps: Math.round(kj * 23.9),
      raw_kilojoules: kj,
      strain_score: score?.strain,
      average_heart_rate: score?.average_heart_rate,
      max_heart_rate: score?.max_heart_rate,
    };
  });
}

const SPORT_NAMES: Record<number, string> = {
  0: 'Activity', 1: 'Running', 16: 'Cycling', 35: 'Swimming',
  44: 'Walking', 45: 'Weight Training', 63: 'Hiking', 71: 'CrossFit',
  126: 'Yoga', 127: 'Pilates', 169: 'HIIT', 189: 'Rowing',
  190: 'Elliptical', 231: 'Jump Rope', 232: 'Rock Climbing',
  257: 'Pickleball', 264: 'Dance', 268: 'Jiu Jitsu', 269: 'Triathlon',
};

function parseWorkouts(raw: { records?: unknown[] }): WhoopWorkout[] {
  return ((raw?.records ?? []) as Record<string, unknown>[])
    .filter((r) => r.score_state === 'SCORED' || r.score_state === 'PENDING_SCORE')
    .map((r) => {
      const score = r.score as Record<string, unknown> | undefined;
      const zones = score?.zone_duration as Record<string, number> | undefined;
      const startMs = new Date(r.start as string).getTime();
      const endMs = new Date(r.end as string).getTime();
      return {
        id: r.id as number,
        date: format(new Date(r.start as string), 'yyyy-MM-dd'),
        start: r.start as string,
        end: r.end as string,
        sport_id: r.sport_id as number,
        sport_name: SPORT_NAMES[r.sport_id as number] ?? 'Workout',
        duration_milli: endMs - startMs,
        strain: score?.strain as number | undefined,
        average_heart_rate: score?.average_heart_rate as number | undefined,
        max_heart_rate: score?.max_heart_rate as number | undefined,
        kilojoules: score?.kilojoule as number | undefined,
        distance_meter: score?.distance_meter as number | undefined,
        zone_durations: zones ? {
          zone_zero: zones.zone_zero_milli ?? 0,
          zone_one: zones.zone_one_milli ?? 0,
          zone_two: zones.zone_two_milli ?? 0,
          zone_three: zones.zone_three_milli ?? 0,
          zone_four: zones.zone_four_milli ?? 0,
          zone_five: zones.zone_five_milli ?? 0,
        } : undefined,
      };
    });
}

async function getJwt(): Promise<string | undefined> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export interface WhoopAllData {
  recovery: WhoopRecovery[];
  sleep: WhoopSleep[];
  cycles: WhoopCycle[];
  workouts: WhoopWorkout[];
  fromCache: boolean;
}

export const whoopService = {
  // ── OAuth helpers ──────────────────────────────────────────

  buildAuthUrl(userId: string): string {
    const callbackPage = `${window.location.origin}/#/whoop/callback`;
    const state = btoa(JSON.stringify({ userId, returnUrl: callbackPage }));
    const params = new URLSearchParams({
      client_id: WHOOP_CLIENT_ID,
      redirect_uri: WHOOP_REDIRECT_URI,
      response_type: 'code',
      scope: WHOOP_SCOPES,
      state,
    });
    return `${WHOOP_AUTH_URL}?${params.toString()}`;
  },

  async getStoredToken(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('whoop_tokens')
      .select('access_token, expires_at, refresh_token')
      .eq('user_id', userId)
      .single();

    if (!data) return null;

    const expiresAt = data.expires_at ? new Date(data.expires_at as string).getTime() : Infinity;
    if (Date.now() < expiresAt - 5 * 60 * 1000) return data.access_token as string;
    if (!data.refresh_token) return data.access_token as string;

    const jwt = await getJwt();
    if (!jwt) return data.access_token as string;

    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'refresh' }),
    });

    if (!res.ok) return data.access_token as string;
    const { access_token } = await res.json() as { access_token: string };
    return access_token;
  },

  async getConnectionInfo(userId: string): Promise<{ connected: boolean; connectedAt?: string } | null> {
    const { data } = await supabase
      .from('whoop_tokens')
      .select('connected_at')
      .eq('user_id', userId)
      .single();
    return data ? { connected: true, connectedAt: data.connected_at as string } : { connected: false };
  },

  async connect(_userId: string, token: string): Promise<void> {
    const jwt = await getJwt();
    if (!jwt) throw new Error('Not authenticated');
    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'store_token', token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      const err = Object.assign(new Error(body.error ?? 'Could not connect'), { status: res.status });
      throw err;
    }
  },

  async disconnect(userId: string): Promise<void> {
    await supabase.from('whoop_tokens').delete().eq('user_id', userId);
    lsClear();
  },

  async validateToken(token: string): Promise<{ user_id: number; email: string; first_name: string; last_name: string }> {
    // Route through edge function to avoid CORS restrictions
    const jwt = await getJwt();
    if (!jwt) throw new Error('Not authenticated');
    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'store_token', token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'Invalid token');
    }
    return res.json();
  },

  // ── Primary data method: one edge-function call, server + localStorage caching ──

  async fetchAll(tab: 'day' | 'week' | 'month', startDate?: string, endDate?: string): Promise<WhoopAllData> {
    const lsKey = `all:${tab}:${startDate ?? 'latest'}:${endDate ?? 'latest'}`;

    // 1. Instant return from localStorage if fresh
    const cached = lsGet<WhoopAllData>(lsKey);
    if (cached) return { ...cached, fromCache: true };

    // 2. Single batch call to edge function (which has its own 15-min DB cache)
    const jwt = await getJwt();
    const res = await fetch(`${EDGE_FN}/whoop-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify({ action: 'fetch_all', tab, start: startDate, end: endDate }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`WHOOP ${res.status}: ${text || res.statusText}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    const raw = await res.json() as {
      recovery: { records?: unknown[] };
      sleep: { records?: unknown[] };
      cycles: { records?: unknown[] };
      workouts: { records?: unknown[] };
      from_cache: boolean;
    };

    const result: WhoopAllData = {
      recovery: parseRecovery(raw.recovery),
      sleep: parseSleep(raw.sleep),
      cycles: parseCycles(raw.cycles),
      workouts: parseWorkouts(raw.workouts ?? {}),
      fromCache: raw.from_cache,
    };

    // 3. Save parsed result to localStorage for next visit
    lsSet(lsKey, result);
    return result;
  },
};
