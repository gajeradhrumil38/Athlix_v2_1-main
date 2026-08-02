// ── Training-load & injury-risk model ────────────────────────────────────────
// Derives sports-science load metrics from WHOOP's daily strain. WHOOP only
// exposes daily aggregates, which is exactly what these models want — they all
// operate on a continuous day-by-day "load" series, using strain (0–21) as the
// per-day training-load unit.
//
// What each metric means physiologically:
//  • ACWR  — Acute:Chronic Workload Ratio. Acute (fatigue, ~7d) vs chronic
//            (fitness base, ~28d) load. The most validated injury-risk metric
//            in sports science: 0.8–1.3 is the "sweet spot", >1.5 is where
//            soft-tissue injury risk climbs sharply (you spiked load faster
//            than your body adapted).
//  • CTL/ATL/Form — the Banister fitness–fatigue model (as popularised by
//            TrainingPeaks). CTL = chronic training load = FITNESS. ATL =
//            acute training load = FATIGUE. Form (a.k.a. TSB) = CTL − ATL:
//            positive = fresh/tapered, deeply negative = dug into a hole.
//  • Monotony / weekly strain (Foster) — how SAME-y your daily loads are.
//            High monotony (little hard/easy variation) predicts overtraining
//            even at moderate volume.

import type { WhoopCycle } from '../types';

export interface DailyLoad {
  date: string; // yyyy-MM-dd
  load: number; // WHOOP strain 0–21 (0 = no data / rest)
}

export interface LoadPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  form: number;
}

export interface LoadMetrics {
  acwr: number;
  acuteLoad: number;   // mean of last 7 days
  chronicLoad: number; // mean of last 28 days
  ctl: number;         // fitness (42-day EWMA)
  atl: number;         // fatigue (7-day EWMA)
  form: number;        // ctl − atl
  monotony: number;    // Foster: mean(7d) / sd(7d)
  weeklyStrain: number; // Foster: sum(7d) × monotony
  daysOfData: number;   // days with an actual strain reading (load > 0)
  series: LoadPoint[];  // per-day CTL/ATL/form for charting
}

const ACUTE_WINDOW = 7;
const CHRONIC_WINDOW = 28;
const CTL_TAU = 42; // fitness time constant (days)
const ATL_TAU = 7;  // fatigue time constant (days)

/**
 * Turn WHOOP cycles into a CONTINUOUS day-by-day load series ending today.
 * Missing days (strap off / rest) become load 0, which is what the rolling
 * windows and EWMAs expect — a gap is genuinely a zero-load day for these
 * models, not missing data to interpolate.
 */
export function buildDailyLoads(cycles: WhoopCycle[], days: number): DailyLoad[] {
  const byDate = new Map<string, number>();
  for (const c of cycles) {
    const s = c.strain_score ?? 0;
    // Keep the max strain if two cycles share a date (rare boundary case).
    byDate.set(c.date, Math.max(byDate.get(c.date) ?? 0, s));
  }

  const out: DailyLoad[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, load: byDate.get(key) ?? 0 });
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Compute the full load-metric set from a continuous, ascending daily series.
 * CTL/ATL are seeded from the mean of the series so early days aren't biased
 * toward zero, then integrated forward day by day.
 */
export function computeLoadMetrics(loads: DailyLoad[]): LoadMetrics {
  const seed = mean(loads.map((l) => l.load));
  let ctl = seed;
  let atl = seed;
  const series: LoadPoint[] = loads.map(({ date, load }) => {
    ctl += (load - ctl) / CTL_TAU;
    atl += (load - atl) / ATL_TAU;
    return { date, load, ctl, atl, form: ctl - atl };
  });

  const last = (n: number) => loads.slice(-n).map((l) => l.load);
  const acuteLoad = mean(last(ACUTE_WINDOW));
  const chronicLoad = mean(last(CHRONIC_WINDOW));
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;

  const week = last(ACUTE_WINDOW);
  const sd = stdDev(week);
  const monotony = sd > 0 ? mean(week) / sd : 0;
  const weeklyStrain = week.reduce((a, b) => a + b, 0) * (monotony || 0);

  const end = series[series.length - 1] ?? { ctl: 0, atl: 0, form: 0 };

  return {
    acwr,
    acuteLoad,
    chronicLoad,
    ctl: end.ctl,
    atl: end.atl,
    form: end.form,
    monotony,
    weeklyStrain,
    daysOfData: loads.filter((l) => l.load > 0).length,
    series,
  };
}

export interface Zone { label: string; color: string; advice: string }

// Green/amber/red tokens shared with the rest of the WHOOP UI.
const GREEN = '#4ade80';
const AMBER = '#fbbf24';
const RED = '#f87171';
const BLUE = '#4FC3F7';

export function acwrZone(acwr: number): Zone {
  if (acwr === 0) return { label: 'No baseline', color: 'rgba(255,255,255,0.4)', advice: 'Need ~4 weeks of data for a reliable ratio.' };
  if (acwr < 0.8) return { label: 'Detraining', color: BLUE, advice: 'Load is dropping vs your base — fine for a taper, but sustained low load erodes fitness.' };
  if (acwr <= 1.3) return { label: 'Optimal', color: GREEN, advice: 'Load is well matched to your fitness base. Lowest injury risk — good place to be.' };
  if (acwr <= 1.5) return { label: 'Caution', color: AMBER, advice: 'Ramping faster than you\'re adapting. Hold here rather than adding more.' };
  return { label: 'High risk', color: RED, advice: 'Acute load has spiked well above your base — the danger zone for soft-tissue injury. Back off for a few days.' };
}

export function formZone(form: number): Zone {
  if (form > 15) return { label: 'Very fresh', color: BLUE, advice: 'Well tapered / detraining — primed to perform, but you\'re shedding fitness if this lasts.' };
  if (form >= 5) return { label: 'Fresh', color: GREEN, advice: 'Recovered and ready for a hard session or event.' };
  if (form >= -10) return { label: 'Neutral', color: GREEN, advice: 'Balanced — the productive training zone.' };
  if (form >= -30) return { label: 'Fatigued', color: AMBER, advice: 'Carrying real fatigue — normal mid-block, but watch recovery.' };
  return { label: 'Overreached', color: RED, advice: 'Deep fatigue debt. Prioritise recovery before the next hard block.' };
}

export function monotonyZone(monotony: number): Zone {
  if (monotony === 0) return { label: '—', color: 'rgba(255,255,255,0.4)', advice: 'Not enough variation in the last week to score.' };
  if (monotony < 1.5) return { label: 'Good variation', color: GREEN, advice: 'Healthy hard/easy contrast across the week.' };
  if (monotony < 2) return { label: 'Moderate', color: AMBER, advice: 'Days are getting samey — make easy days easier and hard days harder.' };
  return { label: 'Too monotonous', color: RED, advice: 'Little day-to-day variation — a known overtraining driver even at moderate volume.' };
}
