import React, { useEffect, useState } from 'react';
import { Heart, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { whoopService, whoopWindowRange } from '../services/whoopService';
import { computeCardiacHealth, type CardiacHealth as CardiacData } from '../services/cardiacHealth';

// Cardiometric-health panel: resting HR, HRV, an estimated VO2max and HR
// reserve, each with its recent trend. Self-fetches the same 28-day window as
// the load card (shared cache — one fetch). See services/cardiacHealth.ts.
const WINDOW_DAYS = 28;

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

  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg,#1a1216 0%,#120e12 100%)', border: '1px solid rgba(248,113,113,0.14)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4" style={{ color: '#f87171' }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>Cardiac Health</span>
        </div>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          heart · aerobic fitness
        </span>
      </div>

      {/* VO2max hero */}
      <div className="flex items-end justify-between mb-3">
        <div>
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
      </div>

      {/* Three cardiac tiles */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resting HR</span>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {data.restingHr ?? '—'}<span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}>bpm</span>
          </div>
          <Trend delta={data.restingHrDelta} goodDown />
        </div>

        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>HRV</span>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {data.hrv ?? '—'}<span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}>ms</span>
          </div>
          <Trend delta={data.hrvDelta} unit="ms" />
        </div>

        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>HR Reserve</span>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {data.hrReserve ?? '—'}<span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}>bpm</span>
          </div>
          <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.3)' }}>max {data.maxHr ?? '—'}</span>
        </div>
      </div>

      {data.vo2max != null && !data.maxHrFromEffort && (
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' }}>
          VO₂max is estimated from your peak HR seen so far. Do a hard session to sharpen it — no max-effort day is in this window yet.
        </p>
      )}
    </div>
  );
};
