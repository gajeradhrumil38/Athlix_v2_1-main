// Is a metric progressing, holding or declining? Smooth with an exponential
// moving average (so one odd week doesn't flip the verdict), then classify
// each point by the smoothed line's relative change against a noise band.
//   ema[i] = α·v[i] + (1−α)·ema[i−1]
//   r[i]   = (ema[i] − ema[i−1]) / |ema[i−1]|
//   up if r > +threshold, down if r < −threshold, else flat

export type TrendState = 'up' | 'flat' | 'down';

// Two entries are just one change — that's a difference, not a trend.
export const MIN_TREND_POINTS = 3;
export const hasTrend = (count: number) => count >= MIN_TREND_POINTS;

export function ema(values: number[], alpha = 0.5): number[] {
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]));
  return out;
}

export function classifyTrend(values: number[], opts: { alpha?: number; threshold?: number } = {}): TrendState[] {
  const { alpha = 0.5, threshold = 0.03 } = opts;
  if (values.length < 2) return values.map(() => 'flat');
  const smooth = ema(values, alpha);
  const states: TrendState[] = smooth.map((v, i) => {
    if (i === 0) return 'flat';
    const prev = smooth[i - 1];
    const diff = v - prev;
    // From zero, any rise is progress and anything else is holding.
    const r = Math.abs(prev) < 1e-9 ? (diff > 0 ? Infinity : diff < 0 ? -Infinity : 0) : diff / Math.abs(prev);
    return r > threshold ? 'up' : r < -threshold ? 'down' : 'flat';
  });
  states[0] = states[1];
  return states;
}

export function trendRuns(states: TrendState[]): { state: TrendState; start: number; end: number }[] {
  const runs: { state: TrendState; start: number; end: number }[] = [];
  states.forEach((s, i) => {
    const last = runs[runs.length - 1];
    if (last && last.state === s) last.end = i;
    else runs.push({ state: s, start: i, end: i });
  });
  return runs;
}
