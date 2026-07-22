/**
 * HealthRings — animated circular score rings.
 * Each ring fills from 0 → score on mount via CSS transition.
 * Color: #f87171 (red) < 34, #fbbf24 (amber) < 67, #4ade80 (green) ≥ 67.
 */

import React, { useEffect, useState } from 'react';
import type { HealthScore, HealthGrade } from '../types';

// ─── Single ring ──────────────────────────────────────────────────────────────

const R        = 36;
const CX       = 46;
const SIZE     = CX * 2; // 92
const CIRC     = 2 * Math.PI * R;

function scoreColor(score: number): string {
  if (score >= 67) return '#4ade80';
  if (score >= 34) return '#fbbf24';
  return '#f87171';
}

interface RingProps {
  score: number;
  label: string;
  size?: 'sm' | 'lg';
  center?: React.ReactNode; // custom centre content (for the grade ring)
}

const Ring: React.FC<RingProps> = ({ score, label, size = 'sm', center }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(t); }, []);

  const isLg     = size === 'lg';
  const svgSize  = isLg ? 120 : SIZE;
  const r        = isLg ? 48 : R;
  const cx       = svgSize / 2;
  const circ     = 2 * Math.PI * r;
  const offset   = animated ? circ * (1 - score / 100) : circ;
  const color    = scoreColor(score);
  const stroke   = isLg ? 10 : 8;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1e2229" strokeWidth={stroke} />
        {/* Progress arc */}
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Centre */}
        {center ?? (
          <text
            x={cx} y={cx}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize={isLg ? 22 : 14}
            fontWeight="800"
            fontFamily="inherit"
          >
            {score}
          </text>
        )}
      </svg>
      {label ? (
        <p style={{ color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
          {label}
        </p>
      ) : null}
    </div>
  );
};

// ─── Grade badge in centre of large ring ─────────────────────────────────────

const GradeCentre: React.FC<{ grade: HealthGrade; score: number }> = ({ grade, score }) => {
  const color = scoreColor(score);
  // lg ring: SVG 120×120, cx=60. Grade (30px) centred at y=47, score (11px) at y=73 → midpoint=60 exactly.
  return (
    <>
      <text x={60} y={47} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={30} fontWeight="900" fontFamily="inherit">
        {grade}
      </text>
      <text x={60} y={73} textAnchor="middle" dominantBaseline="central"
        fill="rgba(255,255,255,0.45)" fontSize={11} fontWeight="700" fontFamily="inherit">
        {score}/100
      </text>
    </>
  );
};

// ─── Recommendation badge ─────────────────────────────────────────────────────

const RecommendationBadge: React.FC<{ recommendation: HealthScore['recommendation'] }> = ({ recommendation }) => {
  const cfg = {
    eat:      { label: 'EAT FREELY',      bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)',  color: '#4ade80', dot: '#4ade80' },
    moderate: { label: 'EAT IN MODERATION', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.25)', color: '#fbbf24', dot: '#fbbf24' },
    avoid:    { label: 'LIMIT OR AVOID',  bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)', color: '#f87171', dot: '#f87171' },
  }[recommendation];

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
      <p style={{ color: cfg.color, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em' }}>
        {cfg.label}
      </p>
    </div>
  );
};

// ─── Full rings block for a label scan ───────────────────────────────────────

export interface HealthRingsProps {
  score: HealthScore;
}

export const HealthRings: React.FC<HealthRingsProps> = ({ score }) => (
  <div className="space-y-5">
    {/* Three rings */}
    <div className="flex items-center justify-center gap-6">
      <Ring score={score.sugarScore}  label="Sugar"  size="sm" />
      <Ring score={score.overall}     label="Health Score" size="lg"
        center={<GradeCentre grade={score.grade} score={score.overall} />} />
      <Ring score={score.sodiumScore} label="Sodium" size="sm" />
    </div>

    {/* Recommendation */}
    <div className="flex justify-center">
      <RecommendationBadge recommendation={score.recommendation} />
    </div>

    {/* Reason */}
    <p style={{ color: '#fff', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
      {score.reason}
    </p>
  </div>
);

// ─── Compact single ring for dish scan ───────────────────────────────────────

export const DishScoreRing: React.FC<{ score: HealthScore }> = ({ score }) => {
  const color = scoreColor(score.overall);
  return (
    <div className="flex items-center gap-4">
      {/* Ring — no label so no extra gap below SVG */}
      <div className="shrink-0">
        <Ring score={score.overall} label="" size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.06em', color }}>
            Grade {score.grade}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {score.overall}/100
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, fontWeight: 500 }}>
          {score.reason}
        </p>
      </div>
    </div>
  );
};
