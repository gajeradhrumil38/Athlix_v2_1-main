// ── Cardiometric / cardiovascular-health model ───────────────────────────────
// Turns WHOOP's daily cardiac signals into fitness/heart-health metrics.
//
//  • Resting HR (RHR) — a lower resting heart rate is one of the clearest
//    signs of cardiovascular fitness. We track the recent average and its
//    trend vs a 3-week baseline (a FALLING RHR = the heart getting stronger).
//  • HRV (rmssd) — heart-rate variability, the balance of the autonomic
//    nervous system. Higher/rising HRV = better recovery capacity and
//    cardiac health.
//  • VO2max estimate — the single best index of aerobic fitness. Estimated
//    from the Uth–Sørensen equation VO2max ≈ 15.3 × (HRmax / HRrest), which
//    needs only a true max HR and resting HR (no gas-exchange lab test).
//  • HR reserve — HRmax − HRrest. A wider reserve means more cardiac
//    headroom and, again, better fitness.

import type { WhoopRecovery, WhoopCycle, WhoopWorkout } from '../types';

export interface TrendPoint { date: string; value: number }

export interface CardiacHealth {
  restingHr: number | null;   // recent 7-day average
  restingHrDelta: number;     // recent − 3-week baseline (negative = improving)
  hrv: number | null;         // recent 7-day average (ms)
  hrvDelta: number;           // recent − baseline (positive = improving)
  maxHr: number | null;       // highest HR observed in the window
  hrReserve: number | null;   // maxHr − restingHr
  vo2max: number | null;      // Uth–Sørensen estimate (ml/kg/min)
  vo2maxLabel: string;
  vo2maxColor: string;
  maxHrFromEffort: boolean;   // true if maxHr came from a real (≥ moderate) effort
  daysOfData: number;
  rhrSeries: TrendPoint[];
  hrvSeries: TrendPoint[];
}

const VO2_UTH = 15.3; // Uth–Sørensen constant

const GREEN = '#4ade80';
const AMBER = '#fbbf24';
const RED = '#f87171';
const BLUE = '#4FC3F7';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Recent (last 7 readings) vs the baseline before that (readings 8–28).
function recentVsBaseline(series: TrendPoint[]): { recent: number | null; delta: number } {
  if (series.length === 0) return { recent: null, delta: 0 };
  const vals = series.map((p) => p.value);
  const recentArr = vals.slice(-7);
  const baselineArr = vals.slice(-28, -7);
  const recent = mean(recentArr);
  const baseline = baselineArr.length ? mean(baselineArr) : recent;
  return { recent, delta: recent - baseline };
}

// General adult VO2max bands (ml/kg/min). Norms shift with age/sex, which the
// profile doesn't store, so these are broad reference categories, not precise.
function vo2Band(v: number): { label: string; color: string } {
  if (v >= 55) return { label: 'Superior', color: GREEN };
  if (v >= 47) return { label: 'Excellent', color: GREEN };
  if (v >= 40) return { label: 'Good', color: BLUE };
  if (v >= 34) return { label: 'Average', color: AMBER };
  return { label: 'Below average', color: RED };
}

export function computeCardiacHealth(
  recovery: WhoopRecovery[],
  cycles: WhoopCycle[],
  workouts: WhoopWorkout[],
): CardiacHealth {
  const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date);

  const rhrSeries: TrendPoint[] = recovery
    .filter((r) => (r.resting_heart_rate ?? 0) > 0)
    .map((r) => ({ date: r.date, value: r.resting_heart_rate }))
    .sort(byDate);
  const hrvSeries: TrendPoint[] = recovery
    .filter((r) => (r.hrv_rmssd_milli ?? 0) > 0)
    .map((r) => ({ date: r.date, value: r.hrv_rmssd_milli }))
    .sort(byDate);

  const { recent: restingHr, delta: restingHrDelta } = recentVsBaseline(rhrSeries);
  const { recent: hrv, delta: hrvDelta } = recentVsBaseline(hrvSeries);

  // True max HR: prefer a hard-effort workout (a genuine ceiling); fall back to
  // the daily cycle max. Estimating VO2max off a max seen only during easy days
  // understates fitness, so flag whether we saw a real effort.
  const workoutMaxes = workouts
    .filter((w) => (w.strain ?? 0) >= 8 && (w.max_heart_rate ?? 0) > 0)
    .map((w) => w.max_heart_rate as number);
  const cycleMaxes = cycles.filter((c) => (c.max_heart_rate ?? 0) > 0).map((c) => c.max_heart_rate as number);
  const maxHrFromEffort = workoutMaxes.length > 0;
  const allMaxes = [...workoutMaxes, ...cycleMaxes];
  const maxHr = allMaxes.length ? Math.max(...allMaxes) : null;

  const hrReserve = maxHr != null && restingHr != null && restingHr > 0 ? maxHr - Math.round(restingHr) : null;

  let vo2max: number | null = null;
  let vo2maxLabel = '—';
  let vo2maxColor = 'rgba(255,255,255,0.4)';
  if (maxHr != null && restingHr != null && restingHr > 0) {
    vo2max = Math.round(VO2_UTH * (maxHr / restingHr) * 10) / 10;
    const band = vo2Band(vo2max);
    vo2maxLabel = band.label;
    vo2maxColor = band.color;
  }

  return {
    restingHr: restingHr != null ? Math.round(restingHr) : null,
    restingHrDelta,
    hrv: hrv != null ? Math.round(hrv) : null,
    hrvDelta,
    maxHr,
    hrReserve,
    vo2max,
    vo2maxLabel,
    vo2maxColor,
    maxHrFromEffort,
    daysOfData: rhrSeries.length,
    rhrSeries,
    hrvSeries,
  };
}
