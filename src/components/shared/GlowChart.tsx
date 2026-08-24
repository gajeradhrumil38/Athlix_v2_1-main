import React, { useId, useMemo, useRef, useState } from 'react';

/**
 * Frosted, dot-grid-textured card shell — the "Weekly Summary" card language
 * from the Run History page (dot grid tinted to the card's accent, soft
 * border, inset highlight). Drop any content inside; the grid sits behind it.
 */
export const DotGridCard: React.FC<{ accent?: string; children: React.ReactNode; className?: string }> = ({ accent = '#c8ff00', children, className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-2xl p-4 ${className}`}
    style={{
      background: 'linear-gradient(160deg,#111821 0%,#090d13 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
    }}
  >
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity: 0.6,
        backgroundImage: `linear-gradient(color-mix(in srgb, ${accent} 12%, transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb, ${accent} 12%, transparent) 1px,transparent 1px)`,
        backgroundSize: '26px 26px',
      }}
    />
    <div className="relative z-10">{children}</div>
  </div>
);

export interface GlowChartPoint { label: string; value: number }

/**
 * Glowing smoothed trend line — the "Cardiac Health" VO2max-spark look
 * (Catmull-Rom smoothed SVG path, soft gradient fill, glowing dots), made
 * into a real small chart: labeled Y-axis levels, X-axis date ticks, a dot
 * on every point, and scrub-to-read-the-value (mouse hover or touch drag).
 * The line runs edge-to-edge — no fade-out, so the most recent point never
 * reads as "cut off" or incomplete.
 */
export const GlowSparkline: React.FC<{
  points: GlowChartPoint[];
  color: string;
  unit?: string;
  height?: number;
  emptyText?: string;
}> = ({ points, color, unit = '', height = 110, emptyText = 'Not enough data yet' }) => {
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
    const smooth = (p: readonly (readonly [number, number])[]): string => {
      let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
      const t = 0.16;
      for (let i = 0; i < p.length - 1; i++) {
        const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p[i + 1];
        const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
        const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
        d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      return d;
    };
    const line = smooth(pts);
    const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
    const mid = (min + max) / 2;
    return { pts, line, area, min, max, yOf: y, yTicks: [max, mid, min] };
  }, [points, h]);

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
            label centers on its line. */}
        <div className="relative shrink-0" style={{ width: 30 }}>
          {geo.yTicks.map((v, i) => (
            <span
              key={i}
              className="absolute tabular-nums"
              style={{
                top: `${(geo.yOf(v) / h) * 100}%`, left: 0,
                transform: i === 0 ? 'translateY(0%)' : i === geo.yTicks.length - 1 ? 'translateY(-100%)' : 'translateY(-50%)',
                fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.38)',
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
                <stop offset="0%" stopColor={color} stopOpacity="0.26" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Labeled horizontal grid lines only — real levels, not decoration */}
            <g opacity="0.16">
              {geo.yTicks.map((v, i) => (
                <line key={i} x1="0" y1={geo.yOf(v)} x2={w} y2={geo.yOf(v)} stroke="#8692a4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            <path d={geo.area} fill={`url(#${uid}-fill)`} />
            <path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
            return (
              <span
                key={i}
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{
                  left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%`,
                  transform: 'translate(-50%,-50%)',
                  width: big ? 9 : 5, height: big ? 9 : 5,
                  background: color,
                  opacity: big ? 1 : 0.5,
                  boxShadow: big ? `0 0 0 2px #0a0f16, 0 0 8px color-mix(in srgb, ${color} 55%, transparent)` : 'none',
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

      {/* X-axis: date/period ticks, indented to line up with the plot area */}
      <div className="flex items-center justify-between" style={{ marginTop: 4, marginLeft: 30 }}>
        {tickIdxs.map((idx) => (
          <span key={idx} style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>{points[idx].label}</span>
        ))}
      </div>
    </div>
  );
};
