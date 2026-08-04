import React from 'react';

// Presentational WHOOP card — a faithful build of the "Whoop Card Redesign"
// Claude Design (semicircle needle gauges + gradient metric tiles + steps
// bar). Pure/dumb: WhoopDashboard computes the real values and passes them in.
// The design's --athlix-* tokens are mapped to this app's CSS vars; the fixed
// gauge/tile hues (sky/amber/lime/purple/red) come straight from the design.

export type WhoopTab = 'day' | 'week' | 'month';

export interface WhoopGauge {
  label: string;
  value: string;      // formatted, or '—'
  pctUnit: string;    // '%' or ''
  pct: number;        // 0–100 fill
  color: string;
  max: string;        // scale end label ('100' | '21')
  caption: string;
}

export interface WhoopTile {
  label: string;
  value: string;      // formatted, or '—'
  unit: string;
  color: string;
  icon: React.ReactNode;
}

export interface WhoopSteps {
  value: string;
  goal: string;
  pct: number;
  reached: boolean;
  showCaption: boolean;
}

const TAB_W: Record<WhoopTab, number> = { day: 30, week: 45, month: 58 };
const EASE = 'cubic-bezier(.4,0,.2,1)';

const NavArrow: React.FC<{ dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }> = ({ dir, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={dir === 'prev' ? 'Previous day' : 'Next day'}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8,
      background: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.3 : 1, transition: 'opacity 150ms',
    }}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'prev' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  </button>
);

// One semicircle gauge: track arc + value arc (dash-offset fill) + a needle
// that rotates from -90° (empty) to +90° (full), matching the design SVG.
const Gauge: React.FC<{ g: WhoopGauge }> = ({ g }) => {
  const clamped = Math.min(Math.max(g.pct, 0), 100);
  const needleDeg = (clamped / 100) * 180 - 90;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width="124" height="90" viewBox="0 0 124 90" style={{ position: 'relative', overflow: 'visible' }}>
        <path d="M10,64 A52,52 0 1 1 114,64" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M10,64 A52,52 0 1 1 114,64" fill="none" stroke={g.color} strokeWidth="8" strokeLinecap="round"
          pathLength={100} strokeDasharray={100} strokeDashoffset={100 - clamped}
          style={{ transition: `stroke-dashoffset 500ms ${EASE}` }}
        />
        <g style={{ transform: `translate(62px,64px) rotate(${needleDeg}deg)`, transformOrigin: '0 0', transition: `transform 500ms ${EASE}` }}>
          <path d="M-1,0 L-3,-31 A3,3 0 0 1 3,-31 L1,0 Z" fill="var(--text-primary)" />
        </g>
        <text x="10" y="84" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>0</text>
        <text x="114" y="84" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-muted)' }}>{g.max}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: -14 }}>
        <span style={{ font: '700 26px/1 Inter, sans-serif', color: 'var(--text-primary)' }}>
          {g.value}
          {g.pctUnit && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginLeft: 1 }}>{g.pctUnit}</span>}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: g.color }}>{g.label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{g.caption}</span>
      </div>
    </div>
  );
};

// One metric tile: a colour-tinted icon header over a gradient-text value.
const Tile: React.FC<{ t: WhoopTile }> = ({ t }) => (
  <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 56, background: `linear-gradient(0deg, var(--bg-surface) 0%, color-mix(in srgb, ${t.color} 16%, var(--bg-surface)) 100%)` }}>
      {t.icon}
    </div>
    <div style={{ padding: '0 6px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>{t.label}</div>
      <div style={{
        font: '700 20px/1 Inter, sans-serif',
        background: `linear-gradient(180deg, color-mix(in srgb, ${t.color} 100%, white 15%) 0%, ${t.color} 100%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }}>
        {t.value}
        {t.unit && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginLeft: 2, WebkitTextFillColor: 'var(--text-secondary)' }}>{t.unit}</span>}
      </div>
    </div>
  </div>
);

export interface WhoopDayNav {
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export const WhoopCard: React.FC<{
  tab: WhoopTab;
  onTab: (t: WhoopTab) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  stale: boolean;
  dateLabel: string | null;
  dayNav?: WhoopDayNav | null;
  gauges: WhoopGauge[];
  tiles: WhoopTile[];
  steps: WhoopSteps;
}> = ({ tab, onTab, loading, error, onRetry, stale, dateLabel, dayNav, gauges, tiles, steps }) => {
  const tabs: WhoopTab[] = ['day', 'week', 'month'];
  const idx = tabs.indexOf(tab);
  const w = TAB_W[tab];

  return (
    <div style={{
      position: 'relative', padding: 20, borderRadius: 20, overflow: 'hidden',
      background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
      border: '1px solid var(--border)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)',
    }}>
      {/* top sheen */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 18%, rgba(255,255,255,0) 40%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          <span style={{ font: '600 14px/1 Inter, sans-serif', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>WHOOP</span>
        </div>
        {dayNav ? (
          // Day-view date stepper — back/forward through the days that have
          // data, like the calendar. Left arrow = older, right = newer.
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavArrow dir="prev" disabled={!dayNav.canPrev} onClick={dayNav.onPrev} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 78, textAlign: 'center' }}>{dayNav.label}</span>
            <NavArrow dir="next" disabled={!dayNav.canNext} onClick={dayNav.onNext} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {dateLabel && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dateLabel}</span>}
            {stale && !loading && <><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>cached</span></>}
          </div>
        )}
      </div>

      {/* Tabs with sliding underline */}
      <div style={{ position: 'relative', display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 26 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => onTab(t)}
            style={{
              flex: 1, textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0',
              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: t === tab ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 200ms',
            }}
          >
            {t}
          </button>
        ))}
        <div style={{
          position: 'absolute', bottom: -1, height: 2, borderRadius: 2, background: 'var(--accent)',
          left: `calc(${idx * (100 / 3)}% + (${100 / 3}% - ${w}px)/2)`, width: w,
          transition: `left 280ms ${EASE}, width 280ms ${EASE}`,
        }} />
      </div>

      {error && (
        <div style={{ marginBottom: 18, borderRadius: 12, padding: '8px 12px', fontSize: 11, background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          {error} — <button onClick={onRetry} style={{ textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Gauges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 28, opacity: loading ? 0.4 : 1, transition: 'opacity 200ms' }}>
        {gauges.map((g) => <Gauge key={g.label} g={g} />)}
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tiles.map((t) => <Tile key={t.label} t={t} />)}
      </div>

      {/* Steps */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Steps</span>
          {steps.showCaption && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>est. from kilojoules</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ font: '700 34px/1 Inter, sans-serif', color: 'var(--accent)' }}>{steps.value}</span>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>/ {steps.goal}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 99, background: 'var(--accent)', width: `${Math.min(steps.pct, 100)}%`, transition: `width 400ms ${EASE}` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={steps.reached ? '#4dff91' : 'var(--text-muted)'} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></svg>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{steps.reached ? 'Goal reached' : `${Math.round(steps.pct)}% of daily goal`}</span>
        </div>
      </div>
    </div>
  );
};

// Icon set used by the tiles (paths lifted from the design).
export const TileIcons = {
  hrv: (c: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 7 4-14 2 7h6" /></svg>,
  rhr: (c: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  inBed: (c: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  strain: (c: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
};
