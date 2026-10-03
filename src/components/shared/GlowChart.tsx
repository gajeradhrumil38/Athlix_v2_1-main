import React, { useId, useMemo, useRef, useState } from 'react';
import { palette } from '../../theme/colors';
import { classifyTrend, hasTrend, MIN_TREND_POINTS, trendRuns, type TrendState } from '../../lib/trend';

/**
 * Grid texture for a chart's plot area only — the card around it stays the
 * plain shared card. Tinted to the chart's accent.
 */
export const PlotGrid: React.FC<{ accent?: string; children: React.ReactNode; className?: string }> = ({ accent = 'var(--accent)', children, className = '' }) => (
  <div className={`relative ${className}`}>
    {/* No box: the grid fades out towards its edges (radial mask) so the
        chart sits in the card rather than in a framed panel. */}
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity: 0.7,
        maskImage: 'radial-gradient(ellipse 72% 70% at 50% 50%, #000 35%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 72% 70% at 50% 50%, #000 35%, transparent 100%)',
        backgroundImage: `linear-gradient(color-mix(in srgb, ${accent} 12%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, ${accent} 12%, transparent) 1px,transparent 1px)`,
        backgroundSize: '26px 26px',
      }}
    />
    <div className="relative px-1 pt-2">{children}</div>
  </div>
);

export interface GlowChartPoint { label: string; value: number }

// Trend states are status colours (theme palette — SVG gradient stops need
// real colours). Labels go with them, never colour alone.
const TREND_COLOR: Record<TrendState, string> = { up: palette.green, flat: 'rgba(255,255,255,0.55)', down: palette.red };
const TREND_LABEL: Record<TrendState, string> = { up: 'Progressing', flat: 'Holding', down: 'Declining' };

// Monotone cubic Hermite interpolation (Fritsch–Carlson), converted to SVG
// cubic-Bezier segments — same family as D3's curveMonotoneX. Unlike a plain
// Catmull-Rom spline, it never overshoots past the data: two equal
// consecutive values (e.g. 20lb, then 20lb again) get a perfectly flat
// segment instead of a bulge/dip borrowed from a neighboring point.
function monotoneCubicPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  if (n < 2) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  if (n === 2) return `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)} L ${xs[1].toFixed(1)} ${ys[1].toFixed(1)}`;

  const dx: number[] = [];
  const d: number[] = []; // secant slope per segment
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    d[i] = dx[i] !== 0 ? (ys[i + 1] - ys[i]) / dx[i] : 0;
  }

  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // Zero tangent at a flat run or a local min/max — required for a flat
    // stretch to render truly flat, and to keep the curve monotone.
    m[i] = d[i - 1] === 0 || d[i] === 0 || (d[i - 1] < 0) !== (d[i] < 0) ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    if (a < 0) m[i] = 0;
    if (b < 0) m[i + 1] = 0;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }

  let path = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx[i] / 3, c1y = ys[i] + (m[i] * dx[i]) / 3;
    const c2x = xs[i + 1] - dx[i] / 3, c2y = ys[i + 1] - (m[i + 1] * dx[i]) / 3;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return path;
}

/**
 * Glowing trend line — the "Cardiac Health" VO2max-spark look (monotone
 * cubic SVG path, soft gradient fill, glowing dots), made into a real small
 * chart: labeled Y-axis levels, X-axis date ticks, a dot on every point, and
 * scrub-to-read-the-value (mouse hover or touch drag). The line runs
 * edge-to-edge — no fade-out, so the most recent point never reads as "cut
 * off" or incomplete.
 */
export const GlowSparkline: React.FC<{
  points: GlowChartPoint[];
  color: string;
  unit?: string;
  height?: number;
  emptyText?: string;
  // Mark progressing (green) and declining (red) stretches with a thin bar
  // above the plot and a faint column wash (EMA-smoothed, ±3% noise band; see
  // lib/trend). Holding gets no mark — it's the quiet default. The line itself
  // keeps the card's identity colour.
  showTrend?: boolean;
}> = ({ points, color, unit = '', height = 110, emptyText = 'Not enough data yet', showTrend = false }) => {
  const uid = useId().replace(/:/g, '');
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const w = 320;
  const h = height;
  const padX = 6;
  const padTop = 8;
  const padBottom = 6;
  const plotH = h - padTop - padBottom;

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const y = (v: number) => padTop + plotH - ((v - min) / range) * plotH;
    const pts = values.map((v, i) => [padX + (i / (values.length - 1)) * (w - 2 * padX), y(v)] as const);
    const line = monotoneCubicPath(pts);
    const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
    const mid = (min + max) / 2;

    const states = showTrend && hasTrend(values.length) ? classifyTrend(values) : null;
    const runs = states ? trendRuns(states) : [];

    return { pts, line, area, min, max, yOf: y, yTicks: [max, mid, min], states, runs };
  }, [points, h, showTrend]);

  if (!geo) {
    return (
      <div style={{ height: h }} className="flex items-center justify-center">
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{emptyText}</span>
      </div>
    );
  }

  const scrub = (clientX: number) => {
    const el = plotRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setActiveIdx(Math.round(relX * (points.length - 1)));
  };

  // Up to 4 evenly-spaced X-axis tick labels (by index, so they land exactly
  // under their point since points are laid out at even index intervals).
  const tickCount = Math.min(4, points.length);
  const tickIdxs = [...new Set(Array.from({ length: tickCount }, (_, i) =>
    Math.round((i * (points.length - 1)) / Math.max(1, tickCount - 1)),
  ))];

  const fmtVal = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 });

  return (
    <div>
      <div className="flex" style={{ height: h }}>
        {/* Y-axis: labeled value levels. The top/bottom labels anchor to
            their own edge (not centered on the line) so they can never
            clip against the card's overflow-hidden — only the middle
            label centers on its line. A left-side scrim sits behind the
            numbers so they stay legible over the card's dot-grid texture. */}
        <div className="relative shrink-0" style={{ width: 30 }}>
          {geo.yTicks.map((v, i) => (
            <span
              key={i}
              className="absolute tabular-nums"
              style={{
                top: `${(geo.yOf(v) / h) * 100}%`, left: 0,
                transform: i === 0 ? 'translateY(0%)' : i === geo.yTicks.length - 1 ? 'translateY(-100%)' : 'translateY(-50%)',
                fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', opacity: 0.85,
              }}
            >
              {fmtVal(v)}
            </span>
          ))}
        </div>

        {/* Plot area — hover (mouse) or drag (touch) to read any point */}
        <div
          ref={plotRef}
          className="relative flex-1 min-w-0"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onMouseMove={(e) => scrub(e.clientX)}
          onMouseLeave={() => setActiveIdx(null)}
          onTouchStart={(e) => scrub(e.touches[0].clientX)}
          onTouchMove={(e) => scrub(e.touches[0].clientX)}
        >
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
              <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.12" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill={`url(#${uid}-fill)`} />
            <path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {activeIdx != null && (
              <line
                x1={geo.pts[activeIdx][0]} y1={0} x2={geo.pts[activeIdx][0]} y2={h}
                stroke={color} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* A state at point i describes the change from i-1 to i, so a run
              covers the interval from the point before it to its last point.
              Thin bar on top + a barely-there wash fading down the column. */}
          {geo.runs.filter((r) => r.state !== 'flat').map((r, i) => {
            const x0 = geo.pts[Math.max(0, r.start - 1)][0];
            const x1 = geo.pts[r.end][0];
            if (x1 - x0 < 1) return null;
            const c = TREND_COLOR[r.state];
            const box = { left: `calc(${(x0 / w) * 100}% + 2px)`, width: `calc(${((x1 - x0) / w) * 100}% - 4px)` };
            return (
              <React.Fragment key={`run${i}`}>
                <span aria-hidden className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ ...box, background: `linear-gradient(${c}14, transparent 70%)` }} />
                <span aria-hidden className="absolute top-0 h-[2px] rounded-full pointer-events-none"
                  style={{ ...box, background: c, opacity: 0.85 }} />
              </React.Fragment>
            );
          })}

          {/* Dots as HTML overlays (not SVG circles) — the SVG's non-uniform
              stretch (preserveAspectRatio="none") would otherwise squash them
              into ellipses. */}
          {/* Only the latest point (end-dot) and the hovered one are drawn —
              a dot on every point cluttered the line; its shape and colour
              carry the trend. */}
          {geo.pts.map(([x, y], i) => {
            const active = activeIdx === i;
            const isLast = i === geo.pts.length - 1;
            const big = active || isLast;
            if (!big) return null;
            const dot = color;
            return (
              <span
                key={i}
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%`,
                  transform: 'translate(-50%,-50%)',
                  width: big ? 9 : 6, height: big ? 9 : 6,
                  background: dot,
                  opacity: big ? 1 : 0.85,
                  boxShadow: big
                    ? `0 0 0 2px #0a0f16, 0 0 8px color-mix(in srgb, ${dot} 55%, transparent)`
                    : `0 0 0 2px #0a0f16`,
                }}
              />
            );
          })}

          {/* Tooltip on the active (hovered/touched) point — flips below
              the point when it's near the top edge (e.g. scrubbing a peak)
              so it can't clip against the card's overflow-hidden. */}
          {activeIdx != null && (() => {
            const [x, y] = geo.pts[activeIdx];
            const xPct = (x / w) * 100;
            const yPct = (y / h) * 100;
            const align = xPct > 72 ? 'right' : xPct < 28 ? 'left' : 'center';
            const below = yPct < 22;
            return (
              <div
                className="absolute z-10 pointer-events-none rounded-lg px-2 py-1"
                style={{
                  left: `${xPct}%`, top: `${yPct}%`,
                  transform: `translate(${align === 'right' ? '-100%' : align === 'left' ? '0%' : '-50%'}, ${below ? '25%' : '-135%'})`,
                  background: '#1a2030', border: '1px solid rgba(255,255,255,0.14)',
                  whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>
                  {fmtVal(points[activeIdx].value)}{unit}
                </p>
                <p style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.5)', lineHeight: 1.2 }}>
                  {points[activeIdx].label}
                </p>
                {geo.states && activeIdx > 0 && points[activeIdx - 1].value > 0 && (() => {
                  const pct = Math.round(((points[activeIdx].value - points[activeIdx - 1].value) / points[activeIdx - 1].value) * 100);
                  return (
                    <p style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.3, color: TREND_COLOR[geo.states[activeIdx]] }}>
                      {pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} {Math.abs(pct)}% vs prev · {TREND_LABEL[geo.states[activeIdx]]}
                    </p>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      {/* X-axis: date/period ticks, indented to line up with the plot area. */}
      <div className="relative flex items-center justify-between pt-2 pb-1" style={{ marginTop: 2, marginLeft: 30 }}>
        {tickIdxs.map((idx) => (
          <span key={idx} className="relative" style={{ fontSize: 9.5, color: 'var(--text-secondary)', opacity: 0.85, fontWeight: 700 }}>{points[idx].label}</span>
        ))}
      </div>

      {showTrend && !geo.states && (
        <p className="mt-1.5" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Trend shows after {MIN_TREND_POINTS} entries · {points.length} so far
        </p>
      )}

      {/* Legend + the latest verdict in words (colour is never the only cue). */}
      {geo.states && geo.runs.length > 0 && (() => {
        const last = geo.runs[geo.runs.length - 1];
        return (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-1.5" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: last.state === 'flat' ? 'var(--text-secondary)' : TREND_COLOR[last.state] }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{TREND_LABEL[last.state]}</span>
              <span>{last.end > last.start ? `since ${points[last.start].label}` : 'now'}</span>
            </span>
            <span className="flex items-center gap-2.5" style={{ fontSize: 10 }}>
              {(['up', 'down'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="h-[2px] w-3 rounded-full" style={{ background: TREND_COLOR[k] }} />{TREND_LABEL[k]}
                </span>
              ))}
            </span>
          </div>
        );
      })()}
    </div>
  );
};
