import React, { useEffect, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Heart, Minus, Waves } from 'lucide-react';
import { whoopService, whoopWindowRange } from '../services/whoopService';
import { computeCardiacHealth, type CardiacHealth as CardiacData } from '../services/cardiacHealth';

// Cardiometric-health panel: resting HR, HRV, an estimated VO2max and HR
// reserve, each with its recent trend. Self-fetches the same 28-day window as
// the load card (shared cache — one fetch). See services/cardiacHealth.ts.
const WINDOW_DAYS = 28;

const trendConfidenceMeta = {
  high: { label: 'Strong trend', color: '#4ade80' },
  medium: { label: 'Trend forming', color: '#fbbf24' },
  low: { label: 'Trend early', color: 'rgba(255,255,255,0.45)' },
} as const;

const vo2ConfidenceLabel: Record<CardiacData['vo2Confidence'], string> = {
  'effort-based': 'Effort based',
  rough: 'Rough estimate',
  none: 'No estimate',
};

// A trend chip. `goodDown` flips the colour meaning: for resting HR a DROP is
// good (fitter heart); for HRV a RISE is good.
const Trend: React.FC<{ delta: number; goodDown?: boolean; unit?: string }> = ({ delta, goodDown, unit }) => {
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return <span className="inline-flex items-center gap-0.5" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700 }}><Minus className="w-2.5 h-2.5" />flat</span>;
  }
  const improving = goodDown ? rounded < 0 : rounded > 0;
  const color = improving ? '#4ade80' : '#f87171';
  const Icon = rounded < 0 ? ArrowDown : ArrowUp;
  return (
    <span className="inline-flex items-center gap-0.5" style={{ color, fontSize: 9, fontWeight: 800 }}>
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
}> = ({ label, value, unit, color, trend, caption }) => (
  <div className="rounded-xl p-3 min-w-0" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
    <span style={{ fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    <div className="flex items-baseline gap-1" style={{ marginTop: 4 }}>
      <span style={{ fontSize: 21, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
        {value ?? '—'}
      </span>
      {value != null && <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.34)' }}>{unit}</span>}
    </div>
    <div style={{ marginTop: 4, minHeight: 13 }}>{trend ?? <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.3)' }}>{caption}</span>}</div>
  </div>
);

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
  const vo2Pct = data.vo2max != null ? Math.min(100, Math.max(0, ((data.vo2max - 25) / 35) * 100)) : 0;
  const advice = data.restingHrDelta >= 3
    ? 'Resting HR is elevated versus baseline. Pair hard training with extra recovery today.'
    : data.hrvDelta <= -6
      ? 'HRV is below baseline. Keep intensity honest until recovery rebounds.'
      : data.restingHrDelta <= -2 && data.hrvDelta >= 3
        ? 'Cardiac signals are improving. A quality session is reasonable if load is controlled.'
        : 'Vitals are steady. Use this with recovery and training load before pushing intensity.';

  return (
    <div className="rounded-2xl p-4 overflow-hidden" style={{ background: 'linear-gradient(160deg,#1a1216 0%,#0f0d12 100%)', border: '1px solid rgba(248,113,113,0.14)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4" style={{ color: '#f87171' }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>Cardiac Health</span>
        </div>
        <span className="px-2 py-1 rounded-full" style={{ fontSize: 9, color: confidence.color, fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: `1px solid color-mix(in srgb, ${confidence.color} 28%, transparent)` }}>
          {confidence.label}
        </span>
      </div>

      {/* VO2max hero */}
      <div className="flex items-end justify-between gap-3 mb-2">
        <div className="min-w-0">
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Est. VO₂max
          </span>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 30, fontWeight: 900, color: data.vo2maxColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {data.vo2max ?? '—'}
            </span>
            {data.vo2max != null && (
              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>ml/kg/min</span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: data.vo2maxColor }}>{data.vo2maxLabel}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div style={{ fontSize: 18, fontWeight: 900, color: '#f87171', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{data.hrReserve ?? '—'}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>HR reserve</div>
        </div>
      </div>

      <div className="relative w-full rounded-full overflow-hidden mb-2" style={{ height: 7, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#f87171 0%,#fbbf24 35%,#4FC3F7 62%,#4ade80 100%)', opacity: 0.35 }} />
        {data.vo2max != null && (
          <div className="absolute rounded-full" style={{ left: `calc(${vo2Pct}% - 4px)`, top: -1, width: 9, height: 9, background: data.vo2maxColor, boxShadow: '0 0 8px rgba(0,0,0,0.55)' }} />
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.36)', fontWeight: 700 }}>
          <Activity className="w-3 h-3" />
          {vo2ConfidenceLabel[data.vo2Confidence]}
        </span>
        <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>
          {data.baselineDays} baseline days
        </span>
      </div>

      {/* Three cardiac tiles */}
      <div className="grid grid-cols-3 gap-2">
        <VitalTile label="Resting HR" value={data.restingHr} unit="bpm" color="white" trend={<Trend delta={data.restingHrDelta} goodDown />} />
        <VitalTile label="HRV" value={data.hrv} unit="ms" color="#afa9ec" trend={<Trend delta={data.hrvDelta} unit="ms" />} />
        <VitalTile label="Max HR" value={data.maxHr} unit="bpm" color="#f87171" caption={data.maxHrFromEffort ? 'from workout' : 'daily high'} />
      </div>

      <p className="flex items-start gap-1.5" style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.56)', lineHeight: 1.45, marginTop: 12 }}>
        <Waves className="w-3.5 h-3.5 shrink-0" style={{ marginTop: 1, color: '#f87171' }} />
        <span>{advice}</span>
      </p>

      {data.vo2max != null && !data.maxHrFromEffort && (
        <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 8, textAlign: 'center' }}>
          VO₂max is estimated from your peak HR seen so far. Do a hard session to sharpen it — no max-effort day is in this window yet.
        </p>
      )}
    </div>
  );
};
