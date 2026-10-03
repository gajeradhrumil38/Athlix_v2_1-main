import React, { useId, useMemo, useRef, useState } from 'react';

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

// Warning colour for stalled stretches (theme status token, never a series colour).
const STALL = 'var(--yellow)';

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
  // Marks any run of 3+ consecutive points that never increases (flat or
  // declining) — a stall a coach should act on, not just a wiggly line.
  flagPlateaus?: boolean;
}> = ({ points, color, unit = '', height = 110, emptyText = 'Not enough data yet', flagPlateaus = false }) => {
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

    let plateaus: { start: number; end: number }[] = [];
    if (flagPlateaus) {
      let runStart = 0;
      for (let i = 1; i <= values.length; i++) {
        const brokeRun = i === values.length || values[i] > values[i - 1];
        if (brokeRun) {
          if (i - 1 - runStart >= 2) plateaus.push({ start: runStart, end: i - 1 });
          runStart = i;
        }
      }
    }

    return { pts, line, area, min, max, yOf: y, yTicks: [max, mid, min], plateaus };
  }, [points, h, flagPlateaus]);

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
              {/* The stalled stretch of the SAME curve: clip the line to each
                  run's x-range and redraw it in the warning colour — the
                  mark is on the line the eye is already following, not a
                  background band competing with the area fill. */}
              <clipPath id={`${uid}-stall`}>
                {geo.plateaus.map((p, i) => (
                  <rect key={i} x={geo.pts[p.start][0]} y={0} width={geo.pts[p.end][0] - geo.pts[p.start][0]} height={h} />
                ))}
              </clipPath>
            </defs>
            <path d={geo.area} fill={`url(#${uid}-fill)`} />
            <path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {geo.plateaus.length > 0 && (
              <path d={geo.line} fill="none" stroke={STALL} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${uid}-stall)`} />
            )}
            {activeIdx != null && (
              <line
                x1={geo.pts[activeIdx][0]} y1={0} x2={geo.pts[activeIdx][0]} y2={h}
                stroke={color} strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Dots as HTML overlays (not SVG circles) — the SVG's non-uniform
              stretch (preserveAspectRatio="none") would otherwise squash them
              into ellipses. */}
          {geo.pts.map(([x, y], i) => {
            const active = activeIdx === i;
            const isLast = i === geo.pts.length - 1;
            const big = active || isLast;
            const dot = geo.plateaus.some((p) => i >= p.start && i <= p.end) ? STALL : color;
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
              </div>
            );
          })()}
        </div>
      </div>

      {/* X-axis: date/period ticks, indented to line up with the plot area.
          A thin rule in the warning colour sits over the axis under each
          stalled stretch — "this span", without covering any data. */}
      <div className="relative flex items-center justify-between pt-2 pb-1" style={{ marginTop: 2, marginLeft: 30 }}>
        {geo.plateaus.map((p, i) => (
          <span key={i} aria-hidden className="absolute top-0 h-[3px] rounded-full pointer-events-none"
            style={{ left: `${(geo.pts[p.start][0] / w) * 100}%`, width: `${((geo.pts[p.end][0] - geo.pts[p.start][0]) / w) * 100}%`, background: STALL }} />
        ))}
        {tickIdxs.map((idx) => (
          <span key={idx} className="relative" style={{ fontSize: 9.5, color: 'var(--text-secondary)', opacity: 0.85, fontWeight: 700 }}>{points[idx].label}</span>
        ))}
      </div>

      {/* Caption doubles as the legend for the yellow stretch: a coloured
          dot + words, never colour alone. Text stays in text colours. Only
          the most recent stall is spelled out. */}
      {geo.plateaus.length > 0 && (() => {
        const run = geo.plateaus[geo.plateaus.length - 1];
        return (
          <p className="flex items-center gap-1.5 mt-1.5" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STALL }} />
            No progress <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{points[run.start].label} → {points[run.end].label}</span>
            {geo.plateaus.length > 1 && <span>· {geo.plateaus.length} stalls in view</span>}
          </p>
        );
      })()}
    </div>
  );
};
