import { supabase } from '../../../lib/supabase';
import type { GpsPoint } from './gpsCalculations';

export interface SavedRun {
  id: number;
  // The Supabase `runs` row's real id, distinct from `id` -- which for a
  // run that exists both locally and in the cloud stays the local
  // Date.now()-based id (mergeRuns keeps it so local storage operations
  // still resolve correctly). Cloud-only operations (deleteRunFromCloud)
  // must use this, never `id`.
  cloudId?: number;
  path: GpsPoint[];
  distance: number;
  duration: number;
  pace: number;
  timestamp: number;
  splits?: { km: number; pace: number }[];
  elevationGain?: number;
  fromCloud?: boolean;
  // Supabase workouts.id this run's Log/Calendar entry lives at, if one
  // was created (only happens for logged-in users — see ActiveRun.tsx's
  // handleStop()). Undefined for runs saved before this existed, or for
  // any run that never got a workout entry in the first place.
  workoutId?: string;
}

const KEY = 'athlix:runs';
const MAX_STORED_RUNS = 120;
const MAX_STORED_PATH_POINTS = 1500;
const MAX_RUN_AGE_MS = 1000 * 60 * 60 * 24 * 120; // 120 days

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizePoint = (point: unknown): GpsPoint | null => {
  if (!point || typeof point !== 'object') return null;
  const maybePoint = point as Partial<GpsPoint>;
  if (!isFiniteNumber(maybePoint.lat) || !isFiniteNumber(maybePoint.lng)) return null;
  if (maybePoint.lat < -90 || maybePoint.lat > 90) return null;
  if (maybePoint.lng < -180 || maybePoint.lng > 180) return null;

  const sanitized: GpsPoint = { lat: maybePoint.lat, lng: maybePoint.lng };
  if (isFiniteNumber(maybePoint.accuracy)) sanitized.accuracy = maybePoint.accuracy;
  if (isFiniteNumber(maybePoint.timestamp)) sanitized.timestamp = maybePoint.timestamp;
  return sanitized;
};

const sanitizeRun = (run: unknown): SavedRun | null => {
  if (!run || typeof run !== 'object') return null;
  const maybeRun = run as Partial<SavedRun>;
  if (!isFiniteNumber(maybeRun.id)) return null;
  if (!isFiniteNumber(maybeRun.distance) || maybeRun.distance < 0) return null;
  if (!isFiniteNumber(maybeRun.duration) || maybeRun.duration < 0) return null;
  if (!isFiniteNumber(maybeRun.pace) || maybeRun.pace < 0) return null;
  if (!isFiniteNumber(maybeRun.timestamp) || maybeRun.timestamp < 0) return null;
  if (!Array.isArray(maybeRun.path)) return null;

  const path = maybeRun.path
    .map((point) => sanitizePoint(point))
    .filter((point): point is GpsPoint => point !== null)
    .slice(-MAX_STORED_PATH_POINTS);

  const result: SavedRun = {
    id: maybeRun.id,
    path,
    distance: maybeRun.distance,
    duration: maybeRun.duration,
    pace: maybeRun.pace,
    timestamp: maybeRun.timestamp,
  };

  if (Array.isArray(maybeRun.splits)) {
    result.splits = (maybeRun.splits as { km: number; pace: number }[]).filter(
      (s) => isFiniteNumber(s.km) && isFiniteNumber(s.pace),
    );
  }

  if (isFiniteNumber(maybeRun.elevationGain) && maybeRun.elevationGain >= 0) {
    result.elevationGain = maybeRun.elevationGain;
  }

  return result;
};

const normalizeRuns = (rawRuns: unknown): SavedRun[] => {
  if (!Array.isArray(rawRuns)) return [];

  const cutoff = Date.now() - MAX_RUN_AGE_MS;

  return rawRuns
    .map((item) => sanitizeRun(item))
    .filter((item): item is SavedRun => item !== null)
    .filter((item) => item.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_STORED_RUNS);
};

export const saveRun = (runData: Omit<SavedRun, 'id'>): SavedRun => {
  const runs = getRuns();
  const normalizedPath = runData.path
    .map((point) => sanitizePoint(point))
    .filter((point): point is GpsPoint => point !== null)
    .slice(-MAX_STORED_PATH_POINTS);

  const saved: SavedRun = {
    id: Date.now(),
    path: normalizedPath,
    distance: Number.isFinite(runData.distance) && runData.distance > 0 ? runData.distance : 0,
    duration: Number.isFinite(runData.duration) && runData.duration > 0 ? runData.duration : 0,
    pace: Number.isFinite(runData.pace) && runData.pace > 0 ? runData.pace : 0,
    timestamp: Number.isFinite(runData.timestamp) && runData.timestamp > 0 ? runData.timestamp : Date.now(),
    splits: runData.splits,
    elevationGain: Number.isFinite(runData.elevationGain) && (runData.elevationGain ?? 0) > 0 ? runData.elevationGain : 0,
  };

  runs.push(saved);
  try {
    const normalizedRuns = normalizeRuns(runs);
    localStorage.setItem(KEY, JSON.stringify(normalizedRuns));
  } catch {
    // Storage full — silently skip
  }
  return saved;
};

export const getRuns = (): SavedRun[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return normalizeRuns(parsed);
  } catch {
    return [];
  }
};

export const deleteRun = (id: number): void => {
  try {
    const filtered = getRuns().filter((r) => r.id !== id);
    localStorage.setItem(KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage write failures
  }
};

// ─── Supabase cloud sync ───────────────────────────────────────────────────────

export async function saveRunToCloud(userId: string, run: SavedRun): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('runs')
      .insert({
        user_id: userId,
        run_ts: run.timestamp,
        distance: run.distance,
        duration: run.duration,
        pace: run.pace,
        path: run.path,
        splits: run.splits ?? [],
        elevation_gain: run.elevationGain ?? 0,
      })
      .select('id')
      .single();
    if (error) return null;
    return (data as any)?.id ?? null;
  } catch {
    return null;
  }
}

export async function linkRunToWorkout(runId: number, workoutId: string): Promise<void> {
  try {
    const { error } = await supabase.from('runs').update({ workout_id: workoutId }).eq('id', runId);
    if (error) console.warn('linkRunToWorkout failed:', error.message);
  } catch (e) {
    console.warn('linkRunToWorkout threw:', e);
  }
}

export async function loadRunsFromCloud(userId: string): Promise<SavedRun[]> {
  try {
    const { data, error } = await supabase
      .from('runs')
      .select('id, run_ts, distance, duration, pace, path, splits, elevation_gain, workout_id')
      .eq('user_id', userId)
      .order('run_ts', { ascending: false })
      .limit(120);
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.id as number,
      cloudId: r.id as number,
      timestamp: r.run_ts as number,
      distance: Number(r.distance),
      duration: Number(r.duration),
      pace: Number(r.pace),
      path: (Array.isArray(r.path) ? r.path : []) as GpsPoint[],
      splits: (Array.isArray(r.splits) ? r.splits : []) as { km: number; pace: number }[],
      elevationGain: Number(r.elevation_gain ?? 0),
      workoutId: (r.workout_id as string | null) ?? undefined,
      fromCloud: true,
    }));
  } catch {
    return [];
  }
}

export async function deleteRunFromCloud(id: number): Promise<void> {
  try {
    await supabase.from('runs').delete().eq('id', id);
  } catch { /* silent */ }
}

/** Merge local + cloud runs, deduplicating by timestamp (within 2 s). Cloud wins on conflict. */
export function mergeRuns(local: SavedRun[], cloud: SavedRun[]): SavedRun[] {
  const merged = new Map<number, SavedRun>();
  // Add local first
  for (const r of local) merged.set(r.timestamp, r);
  // Cloud overwrites if within ±2000 ms of any local entry
  for (const cr of cloud) {
    let matched = false;
    for (const [ts] of merged) {
      if (Math.abs(ts - cr.timestamp) < 2000) {
        // Keep the local id (local storage operations still key off it) but
        // always carry the real cloud id through as cloudId — losing it
        // here (the old code discarded it entirely) meant deleteRunFromCloud
        // got called with the local Date.now() id, matched no row in
        // Supabase, and silently left the cloud row orphaned forever.
        merged.set(ts, { ...cr, id: merged.get(ts)!.id, cloudId: cr.id });
        matched = true;
        break;
      }
    }
    if (!matched) merged.set(cr.timestamp, cr);
  }
  return Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp);
}
