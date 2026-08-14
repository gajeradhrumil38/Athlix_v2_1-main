import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, ShieldAlert } from 'lucide-react';
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

const confidenceMeta = {
  high: { label: 'High confidence', color: '#4ade80' },
  medium: { label: 'Building baseline', color: '#fbbf24' },
  low: { label: 'Low confidence', color: 'rgba(255,255,255,0.45)' },
} as const;

const MetricCell: React.FC<{ label: string; value: string; tone?: string; caption: string }> = ({ label, value, tone = 'white', caption }) => (
  <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
    <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
      {label}
    </div>
    <div style={{ fontSize: 20, fontWeight: 900, color: tone, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
      {value}
    </div>
    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 3, lineHeight: 1.25 }}>
      {caption}
    </div>
  </div>
);

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

  const acwr = metrics ? acwrZone(metrics.acwr, metrics.hasAcwrBaseline) : null;
  const form = metrics ? formZone(metrics.form) : null;
  const mono = metrics ? monotonyZone(metrics.monotony) : null;
  const confidence = metrics ? confidenceMeta[metrics.confidence] : confidenceMeta.low;
  const recentLoads = useMemo(() => metrics?.series.slice(-7) ?? [], [metrics]);
  const maxRecentLoad = useMemo(() => Math.max(1, ...recentLoads.map((p) => p.load)), [recentLoads]);

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
  const coveragePct = Math.round(metrics.coverage * 100);
  const loadAdvice = !metrics.hasAcwrBaseline
    ? 'Keep logging. The ratio needs more observed days before it should steer training.'
    : acwr?.label === 'High risk'
      ? 'Take the next hard session down a notch and let fatigue settle.'
      : acwr?.label === 'Caution'
        ? 'Hold load steady for a few days instead of adding more volume.'
        : acwr?.label === 'Detraining'
          ? 'You have room to add load gradually if recovery is good.'
          : 'You are in the productive zone. Keep progression steady.';

  return (
    <div className="rounded-2xl p-4 overflow-hidden" style={{ background: 'linear-gradient(160deg,#111821 0%,#090d13 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" style={{ color: acwr?.color }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: 'white', letterSpacing: '0.06em' }}>Training Load</span>
        </div>
        <span className="px-2 py-1 rounded-full" style={{ fontSize: 9, color: confidence.color, fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: `1px solid color-mix(in srgb, ${confidence.color} 28%, transparent)` }}>
          {confidence.label}
        </span>
      </div>

      {/* ACWR hero */}
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Acute : Chronic load
          </span>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 30, fontWeight: 900, color: acwr?.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {metrics.hasAcwrBaseline ? metrics.acwr.toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: acwr?.color }}>{acwr?.label}</span>
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 18, fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{coveragePct}%</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>28d coverage</div>
        </div>
      </div>

      {/* ACWR risk track — green sweet-spot band 0.8–1.3 on a 0–2 scale */}
      <div className="relative w-full mb-2" style={{ height: 8 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="absolute top-0 bottom-0 rounded-full" style={{ left: '40%', width: '25%', background: 'rgba(74,222,128,0.25)' }} />
        {metrics.hasAcwrBaseline && (
          <div className="absolute rounded-full" style={{ left: `calc(${acwrPct}% - 4px)`, top: -1, width: 10, height: 10, background: acwr?.color, boxShadow: '0 0 6px rgba(0,0,0,0.5)' }} />
        )}
      </div>

      <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.58)', lineHeight: 1.45, marginBottom: 12 }}>{loadAdvice}</p>

      {/* Last 7 observed days */}
      <div className="rounded-xl p-3 mb-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" style={{ color: '#4FC3F7' }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last 7 days</span>
          </div>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{metrics.acuteDays}/7 observed</span>
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 34 }}>
          {recentLoads.map((point) => {
            const height = point.observed ? Math.max(4, Math.round((point.load / maxRecentLoad) * 32)) : 2;
            return (
              <div key={point.date} className="flex-1 rounded-sm" title={`${point.date}: ${point.observed ? point.load.toFixed(1) : 'no data'}`}
                style={{ height, background: point.observed ? 'linear-gradient(180deg,#4FC3F7 0%,rgba(79,195,247,0.35) 100%)' : 'rgba(255,255,255,0.10)' }} />
            );
          })}
        </div>
      </div>

      {/* Sub-metrics: Form + Monotony */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCell label="7d avg" value={metrics.acuteDays ? metrics.acuteLoad.toFixed(1) : '—'} tone="#4FC3F7" caption="acute load" />
        <MetricCell label="Form" value={`${metrics.form > 0 ? '+' : ''}${metrics.form.toFixed(1)}`} tone={form?.color} caption={form?.label ?? '—'} />
        <MetricCell label="Monotony" value={metrics.monotony > 0 ? metrics.monotony.toFixed(2) : '—'} tone={mono?.color} caption={mono?.label ?? '—'} />
      </div>

      {thin && (
        <p className="flex items-center justify-center gap-1.5" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 9, textAlign: 'center' }}>
          <Activity className="w-3 h-3" />
          {metrics.daysOfData} observed days. Accuracy improves after ~4 weeks.
        </p>
      )}
    </div>
  );
};
