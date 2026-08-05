import { differenceInCalendarDays, format } from 'date-fns';
import type { FoodScan } from '../features/food/types';
import type { SavedRun } from '../features/running/utils/storage';
import type { WhoopAllData } from '../features/whoop/services/whoopService';
import type { LocalExercise, LocalPersonalRecord, LocalWorkout } from './supabaseData';

export type ImprovementWorkout = LocalWorkout & { exercises?: LocalExercise[] };

export interface DailyAthleteSnapshot {
  date: string;
  workoutCount: number;
  totalSets: number;
  totalVolume: number;
  trainedMuscles: string[];
  bestEstimatedOneRepMax: number;
  runDistanceKm: number;
  runPaceMinPerKm: number | null;
  calories: number;
  protein: number;
  recoveryScore: number | null;
  improvementScore: number;
}

export interface ImprovementModel {
  generatedAt: string;
  windowDays: number;
  snapshots: DailyAthleteSnapshot[];
  scores: {
    strength: number;
    volume: number;
    consistency: number;
    recovery: number | null;
    nutrition: number | null;
    running: number | null;
    overall: number;
  };
  trends: {
    activeDays: number;
    workoutSessions: number;
    current7DayVolume: number;
    previous21DayWeeklyVolume: number;
    volumeDeltaPct: number | null;
    strengthDeltaPct: number | null;
    runDistanceDeltaPct: number | null;
    proteinAvg7Day: number | null;
  };
  mlReadiness: {
    status: 'not_enough_data' | 'rules_ready' | 'ml_candidate' | 'ml_ready';
    score: number;
    summary: string;
    requirements: Array<{ label: string; current: number; target: number; met: boolean }>;
  };
  insights: string[];
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const parseLocalDate = (date: string) => {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const daysSince = (date: string) => differenceInCalendarDays(new Date(), parseLocalDate(date));

const dateKeyFromTs = (ts: number) => format(new Date(ts), 'yyyy-MM-dd');

const pctDelta = (current: number, previous: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
};

const scoreFromDelta = (delta: number | null, neutral = 55) => {
  if (delta == null) return neutral;
  return clamp(neutral + delta * 1.2);
};

function emptySnapshot(date: string): DailyAthleteSnapshot {
  return {
    date,
    workoutCount: 0,
    totalSets: 0,
    totalVolume: 0,
    trainedMuscles: [],
    bestEstimatedOneRepMax: 0,
    runDistanceKm: 0,
    runPaceMinPerKm: null,
    calories: 0,
    protein: 0,
    recoveryScore: null,
    improvementScore: 0,
  };
}

function buildSnapshotMap(windowDays: number): Map<string, DailyAthleteSnapshot> {
  const map = new Map<string, DailyAthleteSnapshot>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = format(d, 'yyyy-MM-dd');
    map.set(key, emptySnapshot(key));
  }
  return map;
}

function addWorkouts(map: Map<string, DailyAthleteSnapshot>, workouts: ImprovementWorkout[]) {
  for (const workout of workouts) {
    const snap = map.get(workout.date);
    if (!snap) continue;
    snap.workoutCount += 1;
    for (const muscle of workout.muscle_groups || []) {
      const key = muscle.toLowerCase();
      if (!snap.trainedMuscles.includes(key)) snap.trainedMuscles.push(key);
    }
    for (const ex of workout.exercises || []) {
      const sets = Number(ex.sets) || 0;
      const reps = Number(ex.reps) || 0;
      const weight = Number(ex.weight) || 0;
      snap.totalSets += sets;
      snap.totalVolume += sets * reps * weight;
      if (weight > 0 && reps > 0) {
        const e1rm = weight * (1 + reps / 30);
        snap.bestEstimatedOneRepMax = Math.max(snap.bestEstimatedOneRepMax, e1rm);
      }
    }
  }
}

function addFood(map: Map<string, DailyAthleteSnapshot>, foodScans: FoodScan[]) {
  for (const scan of foodScans) {
    const key = scan.scan_date.slice(0, 10);
    const snap = map.get(key);
    if (!snap) continue;
    snap.calories += Number(scan.total_calories) || 0;
    snap.protein += Number(scan.total_protein) || 0;
  }
}

function addRuns(map: Map<string, DailyAthleteSnapshot>, runs: SavedRun[]) {
  const paceByDate = new Map<string, { weightedPace: number; distance: number }>();
  for (const run of runs) {
    const key = dateKeyFromTs(run.timestamp);
    const snap = map.get(key);
    if (!snap) continue;
    const distance = Number(run.distance) || 0;
    const pace = Number(run.pace) || 0;
    snap.runDistanceKm += distance;
    if (distance > 0 && pace > 0) {
      const existing = paceByDate.get(key) || { weightedPace: 0, distance: 0 };
      existing.weightedPace += pace * distance;
      existing.distance += distance;
      paceByDate.set(key, existing);
    }
  }
  for (const [key, value] of paceByDate.entries()) {
    const snap = map.get(key);
    if (snap && value.distance > 0) snap.runPaceMinPerKm = value.weightedPace / value.distance;
  }
}

function addRecovery(map: Map<string, DailyAthleteSnapshot>, whoopData: WhoopAllData | null) {
  for (const recovery of whoopData?.recovery || []) {
    const key = String((recovery as any).date || '').slice(0, 10);
    const snap = map.get(key);
    const score = Number((recovery as any).recovery_score);
    if (snap && Number.isFinite(score)) snap.recoveryScore = score;
  }
}

function finalizeDailyScores(snapshots: DailyAthleteSnapshot[]) {
  const maxVolume = Math.max(1, ...snapshots.map((s) => s.totalVolume));
  const maxStrength = Math.max(1, ...snapshots.map((s) => s.bestEstimatedOneRepMax));
  const maxRun = Math.max(1, ...snapshots.map((s) => s.runDistanceKm));

  for (const snap of snapshots) {
    const trainingScore = snap.totalVolume > 0 ? (snap.totalVolume / maxVolume) * 40 : 0;
    const strengthScore = snap.bestEstimatedOneRepMax > 0 ? (snap.bestEstimatedOneRepMax / maxStrength) * 25 : 0;
    const runScore = snap.runDistanceKm > 0 ? (snap.runDistanceKm / maxRun) * 15 : 0;
    const proteinScore = snap.protein > 0 ? clamp((snap.protein / 120) * 10, 0, 10) : 0;
    const recoveryScore = snap.recoveryScore != null ? (snap.recoveryScore / 100) * 10 : 5;
    snap.improvementScore = Math.round(clamp(trainingScore + strengthScore + runScore + proteinScore + recoveryScore));
  }
}

function average(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function buildMlReadiness(
  workouts: ImprovementWorkout[],
  foodScans: FoodScan[],
  runs: SavedRun[],
  snapshots: DailyAthleteSnapshot[],
) {
  const datedActivity = new Set<string>();
  for (const w of workouts) datedActivity.add(w.date);
  for (const f of foodScans) datedActivity.add(f.scan_date.slice(0, 10));
  for (const r of runs) datedActivity.add(dateKeyFromTs(r.timestamp));

  const oldestDates = [...datedActivity].sort();
  const historyDays = oldestDates.length ? Math.max(1, differenceInCalendarDays(new Date(), parseLocalDate(oldestDates[0]))) : 0;
  const activeDays = snapshots.filter((s) => s.workoutCount > 0 || s.calories > 0 || s.runDistanceKm > 0 || s.recoveryScore != null).length;
  const strengthSamples = workouts.reduce((sum, w) => sum + (w.exercises || []).filter((e) => Number(e.weight) > 0 && Number(e.reps) > 0).length, 0);

  const requirements = [
    { label: 'History span', current: historyDays, target: 90, met: historyDays >= 90 },
    { label: 'Active data days', current: activeDays, target: 45, met: activeDays >= 45 },
    { label: 'Workout sessions', current: workouts.length, target: 40, met: workouts.length >= 40 },
    { label: 'Strength samples', current: strengthSamples, target: 120, met: strengthSamples >= 120 },
    { label: 'Nutrition logs', current: foodScans.length, target: 30, met: foodScans.length >= 30 },
    { label: 'Runs', current: runs.length, target: 20, met: runs.length >= 20 },
  ];

  const score = Math.round(
    requirements.reduce((sum, req) => sum + clamp(req.current / req.target, 0, 1), 0) / requirements.length * 100,
  );
  const met = requirements.filter((req) => req.met).length;
  const status =
    score >= 85 && met >= 5 ? 'ml_ready'
      : score >= 65 && met >= 4 ? 'ml_candidate'
        : workouts.length >= 8 || activeDays >= 14 ? 'rules_ready'
          : 'not_enough_data';

  const summary =
    status === 'ml_ready' ? 'Enough history for a first personalized ML model.'
      : status === 'ml_candidate' ? 'Close to ML-ready; keep collecting consistent daily data.'
        : status === 'rules_ready' ? 'Enough for rules/statistics, not enough for reliable ML yet.'
          : 'Not enough history yet; collect daily logs first.';

  return { status, score, summary, requirements } as const;
}

export function buildImprovementModel(
  workouts: ImprovementWorkout[],
  prs: LocalPersonalRecord[],
  foodScans: FoodScan[],
  runs: SavedRun[],
  whoopData: WhoopAllData | null,
  windowDays = 90,
): ImprovementModel {
  const map = buildSnapshotMap(windowDays);
  const scopedWorkouts = workouts.filter((w) => daysSince(w.date) < windowDays);
  const scopedFood = foodScans.filter((f) => daysSince(f.scan_date.slice(0, 10)) < windowDays);
  const scopedRuns = runs.filter((r) => differenceInCalendarDays(new Date(), new Date(r.timestamp)) < windowDays);

  addWorkouts(map, scopedWorkouts);
  addFood(map, scopedFood);
  addRuns(map, scopedRuns);
  addRecovery(map, whoopData);

  const snapshots = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  finalizeDailyScores(snapshots);

  const recent7 = snapshots.slice(-7);
  const previous21 = snapshots.slice(-28, -7);
  const recent14 = snapshots.slice(-14);
  const prior42 = snapshots.slice(-56, -14);

  const current7DayVolume = recent7.reduce((sum, s) => sum + s.totalVolume, 0);
  const previous21DayWeeklyVolume = previous21.reduce((sum, s) => sum + s.totalVolume, 0) / 3;
  const volumeDeltaPct = pctDelta(current7DayVolume, previous21DayWeeklyVolume);

  const recentStrength = Math.max(0, ...recent14.map((s) => s.bestEstimatedOneRepMax));
  const priorStrength = Math.max(0, ...prior42.map((s) => s.bestEstimatedOneRepMax));
  const strengthDeltaPct = pctDelta(recentStrength, priorStrength);

  const recentRunKm = recent7.reduce((sum, s) => sum + s.runDistanceKm, 0);
  const previousRunKm = previous21.reduce((sum, s) => sum + s.runDistanceKm, 0) / 3;
  const runDistanceDeltaPct = pctDelta(recentRunKm, previousRunKm);

  const activeDays = snapshots.filter((s) => s.workoutCount > 0 || s.calories > 0 || s.runDistanceKm > 0 || s.recoveryScore != null).length;
  const workoutSessions = scopedWorkouts.length;
  const consistency = clamp((recent7.filter((s) => s.workoutCount > 0 || s.runDistanceKm > 0).length / 4) * 100);
  const recoveryAvg = average(recent7.map((s) => s.recoveryScore ?? NaN));
  const proteinAvg7Day = average(recent7.filter((s) => s.protein > 0).map((s) => s.protein));
  const nutrition = proteinAvg7Day == null ? null : clamp((proteinAvg7Day / 120) * 100);
  const running = scopedRuns.length < 2 ? null : scoreFromDelta(runDistanceDeltaPct);

  const scores = {
    strength: Math.round(scoreFromDelta(strengthDeltaPct)),
    volume: Math.round(scoreFromDelta(volumeDeltaPct)),
    consistency: Math.round(consistency),
    recovery: recoveryAvg == null ? null : Math.round(recoveryAvg),
    nutrition: nutrition == null ? null : Math.round(nutrition),
    running: running == null ? null : Math.round(running),
    overall: 0,
  };
  const scoreParts = [scores.strength, scores.volume, scores.consistency, scores.recovery, scores.nutrition, scores.running]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  scores.overall = Math.round(scoreParts.reduce((sum, v) => sum + v, 0) / Math.max(1, scoreParts.length));

  const mlReadiness = buildMlReadiness(scopedWorkouts, scopedFood, scopedRuns, snapshots);
  const insights: string[] = [];
  if (strengthDeltaPct != null) insights.push(`Strength trend ${strengthDeltaPct >= 0 ? 'up' : 'down'} ${Math.abs(strengthDeltaPct).toFixed(1)}% vs prior 6 weeks.`);
  if (volumeDeltaPct != null) insights.push(`Weekly volume ${volumeDeltaPct >= 0 ? 'up' : 'down'} ${Math.abs(volumeDeltaPct).toFixed(1)}% vs the previous 3-week average.`);
  if (proteinAvg7Day != null) insights.push(`Protein average is ${Math.round(proteinAvg7Day)}g/day over logged days this week.`);
  if (prs.length) insights.push(`${prs.length} personal record${prs.length === 1 ? '' : 's'} available for progression targets.`);
  insights.push(mlReadiness.summary);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    snapshots,
    scores,
    trends: {
      activeDays,
      workoutSessions,
      current7DayVolume: Math.round(current7DayVolume),
      previous21DayWeeklyVolume: Math.round(previous21DayWeeklyVolume),
      volumeDeltaPct,
      strengthDeltaPct,
      runDistanceDeltaPct,
      proteinAvg7Day,
    },
    mlReadiness,
    insights,
  };
}

export function buildImprovementModelSection(model: ImprovementModel): string {
  const reqLines = model.mlReadiness.requirements
    .map((r) => `  ${r.met ? 'OK' : 'NO'} ${r.label}: ${r.current}/${r.target}`)
    .join('\n');
  const insights = model.insights.map((line) => `  ${line}`).join('\n');
  const strengthDelta = model.trends.strengthDeltaPct == null ? 'insufficient data' : `${model.trends.strengthDeltaPct >= 0 ? '+' : ''}${model.trends.strengthDeltaPct.toFixed(1)}%`;
  const volumeDelta = model.trends.volumeDeltaPct == null ? 'insufficient data' : `${model.trends.volumeDeltaPct >= 0 ? '+' : ''}${model.trends.volumeDeltaPct.toFixed(1)}%`;
  const runDelta = model.trends.runDistanceDeltaPct == null ? 'insufficient data' : `${model.trends.runDistanceDeltaPct >= 0 ? '+' : ''}${model.trends.runDistanceDeltaPct.toFixed(1)}%`;

  return `━━ IMPROVEMENT MODEL V1 (rules + statistics) ━━
  Overall score: ${model.scores.overall}/100
  Strength: ${model.scores.strength}/100 (${strengthDelta})
  Volume: ${model.scores.volume}/100 (${volumeDelta})
  Consistency: ${model.scores.consistency}/100
  Recovery: ${model.scores.recovery == null ? 'not enough data' : `${model.scores.recovery}/100`}
  Nutrition: ${model.scores.nutrition == null ? 'not enough data' : `${model.scores.nutrition}/100`}
  Running: ${model.scores.running == null ? 'not enough data' : `${model.scores.running}/100 (${runDelta})`}
  Active data days: ${model.trends.activeDays}/${model.windowDays}
  Workout sessions: ${model.trends.workoutSessions}
  ML readiness: ${model.mlReadiness.status} (${model.mlReadiness.score}/100) — ${model.mlReadiness.summary}
${reqLines}
${insights ? `\nMODEL INSIGHTS:\n${insights}` : ''}`;
}
