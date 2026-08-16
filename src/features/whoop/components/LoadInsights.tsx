import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import { whoopService, whoopWindowRange } from '../services/whoopService';
import { CardGlow } from '../../../components/shared/CardGlow';
import type { WhoopRecovery } from '../types';
import {
  buildDailyLoads, computeLoadMetrics, acwrZone, formZone, monotonyZone, weeklyStrainZone,
  type LoadMetrics,
} from '../services/loadMetrics';

// Training-load & injury-risk panel. Fetches its OWN ~4-week window of cycles
// (independent of the dashboard's day/week/month tab, since these models need
// a continuous 28-day history) and turns WHOOP strain into ACWR, fitness/
// fatigue/form, monotony and weekly strain. See services/loadMetrics.ts.
const WINDOW_DAYS = 28;

const BLUE = '#4FC3F7';
const GREEN = '#4ade80';
const RED = '#f87171';
const AMBER = '#fbbf24';

const confidenceMeta = {
  high: { label: 'High confidence', color: GREEN },
  medium: { label: 'Building baseline', color: AMBER },
  low: { label: 'Low confidence', color: 'rgba(255,255,255,0.45)' },
} as const;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// A single "keep an eye on this" alert, most-urgent first. Returns null when
// nothing warrants attention (the amber pill is then hidden).
function computeWatch(recovery: WhoopRecovery[], m: LoadMetrics): { text: string; color: string } | null {
  if (m.hasAcwrBaseline && m.acwr > 1.5) return { text: 'Watch · load spike', color: RED };

  const hrv = [...recovery]
    .filter((r) => (r.hrv_rmssd_milli ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => r.hrv_rmssd_milli)
    .slice(-7);
  if (hrv.length >= 4) {
    const mu = mean(hrv);
    const sd = Math.sqrt(mean(hrv.map((v) => (v - mu) ** 2)));
    if (mu > 0 && sd / mu > 0.12) return { text: 'Watch · HRV erratic', color: AMBER };
  }
  if (m.weeklyStrain >= 150) return { text: 'Watch · high strain', color: AMBER };
  if (m.monotony >= 2) return { text: 'Watch · monotonous', color: AMBER };
  return null;
}

// ── Arc gauge (ACWR on a 0–2 scale, 270° sweep open at the bottom) ──────
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
};
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = (((a1 - a0) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
};
const A_START = 225; // f=0 (bottom-left)
const A_SWEEP = 270; // to f=1 (bottom-right)
const angleFor = (f: number) => A_START + Math.min(1, Math.max(0, f)) * A_SWEEP;

const ArcGauge: React.FC<{ acwr: number; color: string; label: string; show: boolean }> = ({ acwr, color, label, show }) => {
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const f = Math.min(1, Math.max(0, acwr / 2));
  const mAngle = angleFor(f);
  const [mx, my] = polar(c, c, r, mAngle);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* base track */}
        <path d={arcPath(c, c, r, A_START, A_START + A_SWEEP)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeLinecap="round" />
        {/* coloured bands: blue detraining / green optimal / red high */}
        <path d={arcPath(c, c, r, angleFor(0), angleFor(0.4))} fill="none" stroke={BLUE} strokeWidth={stroke} strokeLinecap="round" />
        <path d={arcPath(c, c, r, angleFor(0.4), angleFor(0.65))} fill="none" stroke={GREEN} strokeWidth={stroke} />
        <path d={arcPath(c, c, r, angleFor(0.65), angleFor(1))} fill="none" stroke={RED} strokeWidth={stroke} strokeLinecap="round" />
        {show && (
          <circle cx={mx} cy={my} r={6} fill="#fff" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 900, color: 'white', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {show ? acwr.toFixed(2) : '—'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color, marginTop: 2 }}>{label}</span>
      </div>
    </div>
  );
};

const Caret: React.FC<{ color: string }> = ({ color }) => (
  <span style={{ fontSize: 9, color, marginLeft: 3, verticalAlign: 'middle' }}>▲</span>
);

const LegendDot: React.FC<{ color: string; label: string; active?: boolean }> = ({ color, label, active }) => (
  <div className="flex items-center gap-2">
    <span style={{ width: 8, height: 8, borderRadius: 99, background: color, opacity: active ? 1 : 0.5, boxShadow: active ? `0 0 6px ${color}` : 'none' }} />
    <span style={{ fontSize: 11, fontWeight: active ? 800 : 600, color: active ? 'white' : 'rgba(255,255,255,0.45)' }}>{label}</span>
  </div>
);

const parseDow = (d: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${d}T00:00:00`).getDay()];

export const LoadInsights: React.FC<{ userId: string }> = ({ userId }) => {
  const [metrics, setMetrics] = useState<LoadMetrics | null>(null);
  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = whoopWindowRange(WINDOW_DAYS);
    whoopService.fetchAll('month', start, end)
      .then((res) => {
        if (cancelled) return;
        const loads = buildDailyLoads(res.cycles, WINDOW_DAYS);
        setMetrics(computeLoadMetrics(loads));
        setRecovery(res.recovery ?? []);
      })
      .catch(() => { if (!cancelled) setMetrics(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const acwr = metrics ? acwrZone(metrics.acwr, metrics.hasAcwrBaseline) : null;
  const form = metrics ? formZone(metrics.form) : null;
  const mono = metrics ? monotonyZone(metrics.monotony) : null;
  const strain = metrics ? weeklyStrainZone(metrics.weeklyStrain) : null;
  const confidence = metrics ? confidenceMeta[metrics.confidence] : confidenceMeta.low;
  const watch = useMemo(() => (metrics ? computeWatch(recovery, metrics) : null), [metrics, recovery]);
  const recentLoads = useMemo(() => metrics?.series.slice(-7) ?? [], [metrics]);
  const maxRecentLoad = useMemo(() => Math.max(1, ...recentLoads.map((p) => p.load)), [recentLoads]);
  const ctlDelta = useMemo(() => {
    const s = metrics?.series ?? [];
    return s.length >= 8 ? s[s.length - 1].ctl - s[s.length - 8].ctl : 0;
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
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: 'linear-gradient(160deg,#111821 0%,#090d13 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset' }}>
      <CardGlow tone={acwr?.color || BLUE} />
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: 'rgba(79,195,247,0.12)', border: '1px solid rgba(79,195,247,0.2)' }}>
              <ShieldAlert className="w-4 h-4" style={{ color: acwr?.color }} />
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '0.01em' }}>Training Load</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 10, color: confidence.color, fontWeight: 800, background: 'rgba(255,255,255,0.04)', border: `1px solid color-mix(in srgb, ${confidence.color} 30%, transparent)` }}>
              {confidence.label}
            </span>
            {watch && (
              <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 10, color: watch.color, fontWeight: 800, background: `color-mix(in srgb, ${watch.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${watch.color} 34%, transparent)` }}>
                {watch.text}
              </span>
            )}
          </div>
        </div>

        {/* Hero: arc gauge + coverage / acute-load stats + legend */}
        <div className="flex items-start gap-4 mb-3">
          <ArcGauge acwr={metrics.acwr} color={acwr?.color || BLUE} label={acwr?.label || '—'} show={metrics.hasAcwrBaseline} />
          <div className="flex-1 min-w-0">
            <div className="flex gap-6 mb-3">
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>28d coverage</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'white', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{coveragePct}%</div>
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Acute load</div>
                <div className="flex items-baseline" style={{ fontSize: 24, fontWeight: 900, color: 'white', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                  {metrics.acuteDays ? metrics.acuteLoad.toFixed(1) : '—'}
                  {metrics.hasAcwrBaseline && metrics.acuteLoad < metrics.chronicLoad && <Caret color={BLUE} />}
                </div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 1 }}>vs chronic {metrics.chronicLoad > 0 ? metrics.chronicLoad.toFixed(1) : '—'}</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <LegendDot color={BLUE} label="Detraining" active={acwr?.label === 'Detraining'} />
              <LegendDot color={GREEN} label="Optimal" active={acwr?.label === 'Optimal'} />
              <LegendDot color={RED} label="High" active={acwr?.label === 'High risk' || acwr?.label === 'Caution'} />
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45, marginBottom: 14 }}>{loadAdvice}</p>

        {/* Last 7 observed days */}
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-2">
            <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last 7 days</span>
            <div className="text-right">
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>{metrics.acuteDays}/7 logged</span>
            </div>
          </div>
          <div className="relative" style={{ height: 74 }}>
            {/* gridlines */}
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="absolute left-0 right-0" style={{ top: `${(i / 3) * 56}px`, height: 1, background: 'rgba(255,255,255,0.05)' }} />
            ))}
            <div className="absolute right-0" style={{ top: -2, fontSize: 11, fontWeight: 800, color: BLUE }}>Avg {metrics.acuteDays ? metrics.acuteLoad.toFixed(1) : '—'}</div>
            <div className="absolute left-0 right-0 flex items-end gap-2" style={{ top: 8, height: 48 }}>
              {recentLoads.map((point, i) => {
                const isToday = i === recentLoads.length - 1;
                const height = point.observed ? Math.max(5, Math.round((point.load / maxRecentLoad) * 46)) : 3;
                return (
                  <div key={point.date} className="flex-1 rounded-md" title={`${point.date}: ${point.observed ? point.load.toFixed(1) : 'no data'}`}
                    style={{
                      height,
                      background: point.observed
                        ? (isToday ? 'transparent' : 'linear-gradient(180deg,#4FC3F7 0%,rgba(79,195,247,0.32) 100%)')
                        : 'rgba(255,255,255,0.08)',
                      border: isToday && point.observed ? `1.5px solid ${BLUE}` : 'none',
                    }} />
                );
              })}
            </div>
            <div className="absolute left-0 right-0 flex gap-2" style={{ top: 60 }}>
              {recentLoads.map((point, i) => (
                <span key={point.date} className="flex-1 text-center" style={{ fontSize: 10, fontWeight: 700, color: i === recentLoads.length - 1 ? BLUE : 'rgba(255,255,255,0.4)' }}>
                  {parseDow(point.date)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Fitness / Fatigue / Form */}
        <div className="grid grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <MetricCol
            label="Fitness" badge={{ text: 'CTL', color: BLUE }}
            value={metrics.ctl.toFixed(1)} caret={ctlDelta > 0 ? GREEN : undefined} tone="white" caption="42-day avg" />
          <MetricCol
            label="Fatigue" badge={{ text: 'ATL', color: RED }}
            value={metrics.atl.toFixed(1)} tone="white" caption="7-day avg" divider />
          <MetricCol
            label="Form" value={`${metrics.form > 0 ? '+' : ''}${metrics.form.toFixed(1)}`}
            caret={metrics.form > 0 ? (form?.color || GREEN) : undefined} tone={form?.color} caption="Fitness − Fatigue" divider />
        </div>

        {/* Monotony / Week strain */}
        <div className="grid grid-cols-2 gap-3 pt-3 mt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <MetricCol
            label="Monotony" value={metrics.monotony > 0 ? metrics.monotony.toFixed(2) : '—'}
            caret={metrics.monotony >= 2 ? RED : undefined} tone={mono?.color} caption={(mono?.label ?? '—').toLowerCase()} />
          <MetricCol
            label="Week strain" value={metrics.weeklyStrain > 0 ? Math.round(metrics.weeklyStrain).toString() : '—'}
            caret={metrics.weeklyStrain >= 150 ? RED : undefined} tone={strain?.color} caption={(strain?.label ?? '—').toLowerCase()} divider />
        </div>

        {thin && (
          <p className="flex items-center justify-center gap-1.5" style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.34)', marginTop: 10, textAlign: 'center' }}>
            <Activity className="w-3 h-3" />
            {metrics.daysOfData} observed days. Accuracy improves after ~4 weeks.
          </p>
        )}
      </div>
    </div>
  );
};

const MetricCol: React.FC<{
  label: string;
  value: string;
  tone?: string;
  caption: string;
  caret?: string;
  badge?: { text: string; color: string };
  divider?: boolean;
}> = ({ label, value, tone = 'white', caption, caret, badge, divider }) => (
  <div className="min-w-0" style={divider ? { borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 12 } : undefined}>
    <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</span>
      {badge && (
        <span style={{ fontSize: 8, fontWeight: 900, color: badge.color, background: `color-mix(in srgb, ${badge.color} 16%, transparent)`, padding: '1px 4px', borderRadius: 4, letterSpacing: '0.04em' }}>{badge.text}</span>
      )}
    </div>
    <div style={{ fontSize: 22, fontWeight: 900, color: tone, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
      {value}{caret && <Caret color={caret} />}
    </div>
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginTop: 3, lineHeight: 1.25 }}>{caption}</div>
  </div>
);
