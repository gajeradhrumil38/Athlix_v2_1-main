import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Heart, Minus } from 'lucide-react';
import { whoopService, whoopWindowRange } from '../services/whoopService';
import { computeCardiacHealth, type CardiacHealth as CardiacData } from '../services/cardiacHealth';
import { CardGlow } from '../../../components/shared/CardGlow';

// Cardiometric-health panel: resting HR, HRV, an estimated VO2max (with a trend
// line) and HR reserve. Self-fetches the same 28-day window as the load card
// (shared cache — one fetch). See services/cardiacHealth.ts.
const WINDOW_DAYS = 28;

const GREEN = '#4ade80';
const RED = '#f87171';
const BLUE = '#4FC3F7';
const AMBER = '#fbbf24';

const trendConfidenceMeta = {
  high: { label: 'Strong trend', color: GREEN },
  medium: { label: 'Trend forming', color: AMBER },
  low: { label: 'Trend early', color: 'rgba(255,255,255,0.45)' },
} as const;

// A trend chip. `goodDown` flips the colour meaning: for resting HR a DROP is
// good (fitter heart); for HRV a RISE is good.
const Trend: React.FC<{ delta: number; goodDown?: boolean; unit?: string }> = ({ delta, goodDown, unit }) => {
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return <span className="inline-flex items-center gap-0.5" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9.5, fontWeight: 700 }}><Minus className="w-2.5 h-2.5" />flat</span>;
  }
  const improving = goodDown ? rounded < 0 : rounded > 0;
  const color = improving ? GREEN : RED;
  const Icon = rounded < 0 ? ArrowDown : ArrowUp;
  return (
    <span className="inline-flex items-center gap-0.5" style={{ color, fontSize: 9.5, fontWeight: 800 }}>
      <Icon className="w-2.5 h-2.5" />{Math.abs(rounded)}{unit}
    </span>
  );
};

const VitalTile: React.FC<{
  label: string;
  value: number | string | null;
  unit: string;
  color: string;
  trend?: React.ReactNode;
  caption?: string;
  divider?: boolean;
}> = ({ label, value, unit, color, trend, caption, divider }) => (
  <div className="min-w-0" style={divider ? { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 12 } : undefined}>
    <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
      <span style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
        {value ?? '—'}
      </span>
      {value != null && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.34)' }}>{unit}</span>}
    </div>
    <div style={{ marginTop: 4, minHeight: 13 }}>{trend ?? <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{caption}</span>}</div>
  </div>
);

// VO2max trend sparkline (area + line) from the per-day estimate series.
const Vo2Spark: React.FC<{ values: number[] }> = ({ values }) => {
  const w = 220;
  const h = 58;
  const pad = 4;
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }, [values]);

  if (!path) return <div style={{ height: h }} className="flex items-center justify-center"><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Building trend…</span></div>;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="vo2fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.28" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill="url(#vo2fill)" />
      <path d={path.line} fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={path.last[0]} cy={path.last[1]} r={3} fill={GREEN} />
    </svg>
  );
};

export const CardiacHealth: React.FC<{ userId: string }> = ({ userId }) => {
  const [data, setData] = useState<CardiacData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = whoopWindowRange(WINDOW_DAYS);
    whoopService.fetchAll('month', start, end)
      .then((res) => {
        if (cancelled) return;
        setData(computeCardiacHealth(res.recovery, res.cycles, res.workouts));
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="rounded-2xl animate-pulse" style={{ height: 150, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />;
  }
  if (!data || data.daysOfData < 2) return null;

  const confidence = trendConfidenceMeta[data.trendConfidence];
  const vo2Vals = data.vo2Series.map((p) => p.value);
  const vo2DeltaRounded = Math.round(data.vo2Delta * 10) / 10;
  const advice = data.restingHrDelta >= 3
    ? 'Resting HR is elevated versus baseline. Pair hard training with extra recovery today.'
    : data.hrvDelta <= -6
      ? 'HRV is below baseline. Keep intensity honest until recovery rebounds.'
      : data.restingHrDelta <= -2 && data.hrvDelta >= 3
        ? 'Cardiac signals are improving. A quality session is reasonable if load is controlled.'
        : 'Vitals are steady — factor this into recovery and training load before pushing intensity.';

  return (
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: 'linear-gradient(160deg,#1a1216 0%,#0f0d12 100%)', border: '1px solid rgba(248,113,113,0.14)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
      <CardGlow tone={RED} />
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <Heart className="w-4 h-4" style={{ color: RED }} />
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '0.01em' }}>Cardiac Health</span>
          </div>
          <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 10, color: confidence.color, fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: `1px solid color-mix(in srgb, ${confidence.color} 30%, transparent)` }}>
            {confidence.label}
          </span>
        </div>

        {/* Hero: VO2max (heart backdrop) + VO2max trend */}
        <div className="flex items-stretch gap-3 mb-4">
          <div className="relative flex flex-col items-center justify-center shrink-0" style={{ width: 128 }}>
            <Heart className="absolute" style={{ width: 92, height: 92, color: RED, opacity: 0.1, fill: RED }} strokeWidth={1} />
            <div className="relative flex flex-col items-center">
              <span style={{ fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Est. VO₂max</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: data.vo2maxColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {data.vo2max ?? '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>ml/kg/min</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: data.vo2maxColor, marginTop: 2 }}>{data.vo2maxLabel}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>VO₂max trend</span>
              {vo2Vals.length >= 2 && vo2DeltaRounded !== 0 && (
                <span className="inline-flex items-center gap-0.5" style={{ fontSize: 11, fontWeight: 800, color: vo2DeltaRounded > 0 ? GREEN : RED }}>
                  {vo2DeltaRounded > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {vo2DeltaRounded > 0 ? '+' : ''}{vo2DeltaRounded.toFixed(1)}
                </span>
              )}
            </div>
            <Vo2Spark values={vo2Vals} />
            <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>4wk ago</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>Now</span>
            </div>
          </div>
        </div>

        {/* Vitals */}
        <div className="grid grid-cols-4 gap-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <VitalTile label="Resting HR" value={data.restingHr} unit="bpm" color={BLUE} trend={<Trend delta={data.restingHrDelta} goodDown />} />
          <VitalTile label="HRV" value={data.hrv} unit="ms" color={AMBER} trend={<Trend delta={data.hrvDelta} unit="ms" />} divider />
          <VitalTile label="Max HR" value={data.maxHr} unit="bpm" color={RED} caption={data.maxHrFromEffort ? 'from workout' : 'daily high'} divider />
          <VitalTile label="HR reserve" value={data.hrReserve} unit="bpm" color={GREEN} caption="wider = fitter" divider />
        </div>

        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.58)', lineHeight: 1.45, marginTop: 14 }}>{advice}</p>

        {data.vo2max != null && !data.maxHrFromEffort && (
          <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 8, textAlign: 'center' }}>
            VO₂max is estimated from your peak HR seen so far. Do a hard session to sharpen it — no max-effort day is in this window yet.
          </p>
        )}
      </div>
    </div>
  );
};
