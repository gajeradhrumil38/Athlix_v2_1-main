import React, { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, TrendingUp } from 'lucide-react';
import { whoopService, whoopWindowRange } from '../services/whoopService';
import {
  buildDailyLoads, computeLoadMetrics, acwrZone, formZone, monotonyZone,
  type LoadMetrics,
} from '../services/loadMetrics';

// Training-load & injury-risk panel. Fetches its OWN ~4-week window of cycles
// (independent of the dashboard's day/week/month tab, since these models need
// a continuous 28-day history) and turns WHOOP strain into ACWR, fitness/
// fatigue/form, and monotony. See services/loadMetrics.ts for the maths.
const WINDOW_DAYS = 28;

export const LoadInsights: React.FC<{ userId: string }> = ({ userId }) => {
  const [metrics, setMetrics] = useState<LoadMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = whoopWindowRange(WINDOW_DAYS);
    whoopService.fetchAll('month', start, end)
      .then((res) => {
        if (cancelled) return;
        const loads = buildDailyLoads(res.cycles, WINDOW_DAYS);
        setMetrics(computeLoadMetrics(loads));
      })
      .catch(() => { if (!cancelled) setMetrics(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const acwr = metrics ? acwrZone(metrics.acwr) : null;
  const form = metrics ? formZone(metrics.form) : null;
  const mono = metrics ? monotonyZone(metrics.monotony) : null;

  // Where the ACWR marker sits on the 0–2 risk scale (the 0.8–1.3 sweet spot
  // is the green band). Clamped so an extreme ratio stays on the track.
  const acwrPct = useMemo(() => {
    const v = metrics?.acwr ?? 0;
    return Math.min(100, Math.max(0, (v / 2) * 100));
  }, [metrics]);

  if (loading) {
    return <div className="rounded-2xl animate-pulse" style={{ height: 150, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />;
  }
  if (!metrics || metrics.daysOfData < 3) return null; // nothing meaningful to show yet

  const thin = metrics.daysOfData < 14;

  return (
    <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(160deg,#141821 0%,#0e1219 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" style={{ color: acwr?.color }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>Training Load</span>
        </div>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          injury risk · fitness · fatigue
        </span>
      </div>

      {/* ACWR hero */}
      <div className="flex items-end justify-between mb-1.5">
        <div>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Acute : Chronic load
          </span>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 30, fontWeight: 900, color: acwr?.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {metrics.acwr > 0 ? metrics.acwr.toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: acwr?.color }}>{acwr?.label}</span>
          </div>
        </div>
      </div>

      {/* ACWR risk track — green sweet-spot band 0.8–1.3 on a 0–2 scale */}
      <div className="relative w-full mb-2" style={{ height: 8 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute top-0 bottom-0 rounded-full" style={{ left: '40%', width: '25%', background: 'rgba(74,222,128,0.25)' }} />
        {metrics.acwr > 0 && (
          <div className="absolute rounded-full" style={{ left: `calc(${acwrPct}% - 4px)`, top: -1, width: 10, height: 10, background: acwr?.color, boxShadow: '0 0 6px rgba(0,0,0,0.5)' }} />
        )}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, marginBottom: 12 }}>{acwr?.advice}</p>

      {/* Sub-metrics: Form + Monotony */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1 mb-0.5">
            <TrendingUp className="w-3 h-3" style={{ color: form?.color }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Form</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span style={{ fontSize: 18, fontWeight: 900, color: form?.color, fontVariantNumeric: 'tabular-nums' }}>
              {metrics.form > 0 ? '+' : ''}{metrics.form.toFixed(1)}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: form?.color }}>{form?.label}</span>
          </div>
          <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.3)' }}>
            fitness {metrics.ctl.toFixed(1)} · fatigue {metrics.atl.toFixed(1)}
          </span>
        </div>

        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Monotony</span>
          <div className="flex items-baseline gap-1.5">
            <span style={{ fontSize: 18, fontWeight: 900, color: mono?.color, fontVariantNumeric: 'tabular-nums' }}>
              {metrics.monotony > 0 ? metrics.monotony.toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: mono?.color }}>{mono?.label}</span>
          </div>
          <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.3)' }}>week strain {Math.round(metrics.weeklyStrain)}</span>
        </div>
      </div>

      {thin && (
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' }}>
          Building baseline — {metrics.daysOfData} days of data so far. Accuracy improves after ~4 weeks.
        </p>
      )}
    </div>
  );
};
