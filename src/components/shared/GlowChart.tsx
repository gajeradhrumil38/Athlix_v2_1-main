import React, { useId, useMemo } from 'react';

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

/**
 * Glowing smoothed trend line — the "Cardiac Health" VO2max-spark style:
 * Catmull-Rom smoothed SVG path, soft gradient fill, faint edge-fading grid,
 * a glowing end-dot. Non-interactive by design (no tooltip/axis) — for a
 * glanceable trend strip, not a data-inspection chart.
 */
export const GlowSparkline: React.FC<{
  values: number[];
  color: string;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
  bg?: string; // must match the immediate solid background this sits on, for the edge fade
  emptyText?: string;
}> = ({ values, color, height = 72, leftLabel, rightLabel, bg = '#0d1420', emptyText = 'Not enough data yet' }) => {
  const uid = useId().replace(/:/g, '');
  const w = 320;
  const h = height;
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
    return { line, area, last: pts[pts.length - 1] };
  }, [values, h]);

  if (!path) {
    return (
      <div style={{ height: h }} className="flex items-center justify-center">
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{emptyText}</span>
      </div>
    );
  }

  const rows = [0.28, 0.5, 0.72];
  const cols = [0.2, 0.4, 0.6, 0.8];

  return (
    <div>
      <div className="relative w-full" style={{ height: h }}>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.26" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-gridfade`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" />
              <stop offset="38%" stopColor="#fff" />
              <stop offset="62%" stopColor="#fff" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
            <mask id={`${uid}-mask`}><rect x="0" y="0" width={w} height={h} fill={`url(#${uid}-gridfade)`} /></mask>
          </defs>
          <g mask={`url(#${uid}-mask)`} opacity="0.11">
            {rows.map((f, i) => <line key={`r${i}`} x1="0" y1={h * f} x2={w} y2={h * f} stroke="#8692a4" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            {cols.map((f, i) => <line key={`c${i}`} x1={w * f} y1="0" x2={w * f} y2={h} stroke="#8692a4" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          </g>
          <path d={path.area} fill={`url(#${uid}-fill)`} />
          <path d={path.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div aria-hidden className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: '10%', background: `linear-gradient(90deg, ${bg} 0%, transparent 100%)` }} />
        <div aria-hidden className="absolute inset-y-0 right-0 pointer-events-none" style={{ width: '10%', background: `linear-gradient(270deg, ${bg} 0%, transparent 100%)` }} />
        <span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${(path.last[0] / w) * 100}%`,
            top: `${(path.last[1] / h) * 100}%`,
            transform: 'translate(-50%,-50%)',
            width: 8, height: 8, background: color,
            boxShadow: `0 0 0 2px ${bg}, 0 0 8px color-mix(in srgb, ${color} 55%, transparent)`,
          }}
        />
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex items-center justify-between" style={{ marginTop: 3 }}>
          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>{leftLabel}</span>
          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', fontWeight: 700 }}>{rightLabel}</span>
        </div>
      )}
    </div>
  );
};
