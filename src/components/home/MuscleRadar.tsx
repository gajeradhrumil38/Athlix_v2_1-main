import React from 'react';

interface MuscleEntry {
  sets: number;
  load: number;
  relativeLoad: number;
  sessions: number;
}

interface MuscleRadarProps {
  muscleData: Record<string, MuscleEntry>;
  // Which window the data covers, shown after the title ("· this week").
  periodLabel?: string;
  // Sets scale with the window: a month holds ~4 weeks of sets, a single day
  // a fraction of one. Keeps the spokes and goal ring meaningful per period.
  scale?: number;
  // Hide the built-in "MUSCLE LOAD" title when a card shell already shows it.
  showTitle?: boolean;
}

const SPOKES = [
  { key: 'Chest',     hex: '#F09595' },
  { key: 'Shoulders', hex: '#AFA9EC' },
  { key: 'Back',      hex: '#5DCAA5' },
  { key: 'Biceps',    hex: '#85B7EB' },
  { key: 'Legs',      hex: '#EF9F27' },
  { key: 'Glutes',    hex: '#F4B96A' },
  { key: 'Core',      hex: '#ff7a59' },
  { key: 'Triceps',   hex: '#AFA9EC' },
];

const MAX_SETS = 15;
const TARGET_SETS = 10;

export const MuscleRadar: React.FC<MuscleRadarProps> = ({ muscleData, periodLabel = 'this week', scale = 1, showTitle = true }) => {
  const maxSets = MAX_SETS * scale;
  const targetSets = Math.max(1, Math.round(TARGET_SETS * scale));
  const normalize = (sets: number) => Math.min(sets / maxSets, 1);
  const N = SPOKES.length;
  // Bigger chart for mobile clarity
  const SIZE = 290;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 112;
  const LABEL_R = R + 16;

  const angleOf = (i: number) => -Math.PI / 2 + (2 * Math.PI / N) * i;

  const spoke = SPOKES.map((m, i) => {
    const angle = angleOf(i);
    const sets = muscleData[m.key]?.sets || 0;
    const load = normalize(sets);
    return {
      ...m,
      angle,
      load,
      sets,
      px: cx + R * load * Math.cos(angle),
      py: cy + R * load * Math.sin(angle),
      lx: cx + LABEL_R * Math.cos(angle),
      ly: cy + LABEL_R * Math.sin(angle),
      axisx: cx + R * Math.cos(angle),
      axisy: cy + R * Math.sin(angle),
    };
  });

  // Filled polygon of actual load
  const polygon = spoke
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${s.px.toFixed(2)},${s.py.toFixed(2)}`)
    .join(' ') + ' Z';

  // Ghost target polygon — ideal training volume
  const targetLoad = Math.min(targetSets / maxSets, 1);
  const ghostPolygon = spoke
    .map((_, i) => {
      const a = angleOf(i);
      return `${i === 0 ? 'M' : 'L'}${(cx + R * targetLoad * Math.cos(a)).toFixed(2)},${(cy + R * targetLoad * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ') + ' Z';

  // Rings at 20/40/60/80/100%
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  const topMuscles = SPOKES
    .map(m => ({ ...m, sets: muscleData[m.key]?.sets || 0 }))
    .filter(m => m.sets > 0)
    .sort((a, b) => b.sets - a.sets);

  const hasData = topMuscles.length > 0;
  const dominant = topMuscles[0];

  const anchor = (lx: number) => {
    if (lx < cx - 8) return 'end';
    if (lx > cx + 8) return 'start';
    return 'middle';
  };

  return (
    <div className="flex flex-col">
      {/* Header — omitted inside a card shell that already says this. */}
      {showTitle && (
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">
            MUSCLE LOAD
          </h3>
          <span className="text-[10px] text-[var(--text-secondary)]">· {periodLabel}</span>
        </div>
        {dominant && (
          <span
            className="text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{
              background: `${dominant.hex}15`,
              color: dominant.hex,
              border: `1px solid ${dominant.hex}28`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: dominant.hex }}
            />
            {dominant.key} dominant
          </span>
        )}
      </div>
      )}

      {/* Radar SVG — fills the card width */}
      <div className="relative w-full" style={{ aspectRatio: '1/1', maxHeight: 440 }}>
        {/* Widen the viewBox horizontally so long edge labels (CORE / BACK /
            SHOULDERS) render fully instead of clipping at the SVG edge. */}
        <svg viewBox={`-30 -4 ${SIZE + 62} ${SIZE + 8}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="chartBg2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.03)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <radialGradient id="radarFill3" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#C8FF00" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#C8FF00" stopOpacity="0.12" />
            </radialGradient>
          </defs>

          {/* Solid face under the web so the card's plot grid doesn't show
              through the chart itself — only around it. */}
          <path
            d={spoke.map((s, i) => `${i === 0 ? 'M' : 'L'}${s.axisx.toFixed(2)},${s.axisy.toFixed(2)}`).join(' ') + ' Z'}
            fill="#0c0d10"
          />
          <circle cx={cx} cy={cy} r={R + 2} fill="url(#chartBg2)" />

          {/* Ring grid */}
          {rings.map((r, ri) => {
            const pts =
              spoke
                .map((_, i) => {
                  const a = angleOf(i);
                  return `${i === 0 ? 'M' : 'L'}${(cx + R * r * Math.cos(a)).toFixed(2)},${(cy + R * r * Math.sin(a)).toFixed(2)}`;
                })
                .join(' ') + ' Z';
            return (
              <path
                key={ri}
                d={pts}
                fill="none"
                stroke={
                  r === 1.0
                    ? 'rgba(255,255,255,0.22)'
                    : r === 0.6
                      ? 'rgba(255,255,255,0.10)'
                      : 'rgba(255,255,255,0.06)'
                }
                strokeWidth={r === 1.0 ? 1.3 : 0.6}
                strokeDasharray={r === 0.6 ? '2,3' : undefined}
              />
            );
          })}

          {/* % labels — subtle, only at 40% and 80%, set between the first
              two spokes so they never sit on the Chest trace. */}
          {[0.4, 0.8].map(r => (
            <text
              key={r}
              x={cx + R * r * Math.cos(angleOf(0.5)) + 2}
              y={cy + R * r * Math.sin(angleOf(0.5))}
              fontSize="8"
              fill="rgba(255,255,255,0.28)"
              textAnchor="start"
            >
              {r * 100}%
            </text>
          ))}

          {/* Axis spokes */}
          {spoke.map((s, i) => (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={s.axisx} y2={s.axisy}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="0.7"
            />
          ))}

          {/* Ghost target polygon */}
          <path
            d={ghostPolygon}
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />

          {/* Load fill polygon */}
          {hasData && (
            <path
              d={polygon}
              fill="url(#radarFill3)"
              stroke="#C8FF00"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          )}

          {/* Animated pulse + dot per spoke */}
          {hasData &&
            spoke.map((s, i) =>
              s.load > 0 ? (
                <g key={i}>
                  {/* Pulse ring */}
                  <circle cx={s.px} cy={s.py} r="2.5" fill={s.hex} opacity="0">
                    <animate
                      attributeName="r"
                      values="2.5;8;2.5"
                      dur="3.2s"
                      repeatCount="indefinite"
                      begin={`${i * 0.4}s`}
                    />
                    <animate
                      attributeName="opacity"
                      values="0.22;0;0.22"
                      dur="3.2s"
                      repeatCount="indefinite"
                      begin={`${i * 0.4}s`}
                    />
                  </circle>
                  {/* Solid dot */}
                  <circle cx={s.px} cy={s.py} r="4.2" fill={s.hex} stroke="#0c0d10" strokeWidth="1.5" />
                </g>
              ) : null,
            )}

          {/* Center dot */}
          <circle cx={cx} cy={cy} r="2.5" fill="rgba(200,255,0,0.22)" />

          {/* Muscle name labels — name only, no numbers */}
          {spoke.map((s, i) => {
            const isActive = s.load > 0;
            return (
              <text
                key={i}
                x={s.lx}
                y={s.ly}
                textAnchor={anchor(s.lx)}
                dominantBaseline="middle"
                fontSize="13"
                fontWeight="800"
                fill={isActive ? s.hex : 'rgba(255,255,255,0.45)'}
                letterSpacing="0.5"
              >
                {s.key.toUpperCase()}
              </text>
            );
          })}
        </svg>

        {/* Ghost legend */}
        {hasData && (
          <div className="absolute bottom-2 right-1 flex items-center gap-1 opacity-50">
            <svg width="14" height="5">
              <line x1="0" y1="2.5" x2="14" y2="2.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" strokeDasharray="2,2.5" />
            </svg>
            <span className="text-[11px] text-[var(--text-secondary)]">Goal ({targetSets} sets)</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!hasData && (
        <p className="text-[10px] text-[var(--text-secondary)] text-center pb-2">
          No data yet — log a workout
        </p>
      )}
    </div>
  );
};
