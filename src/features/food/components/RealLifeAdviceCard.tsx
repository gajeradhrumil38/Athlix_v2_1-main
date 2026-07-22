import React from 'react';
import type { DetectedFood, HealthScore } from '../types';

interface Props {
  foods: DetectedFood[];
  score: HealthScore;
  totalCalories: number;
}

function calorieEquivalent(kcal: number): string {
  if (kcal <= 0) return '';
  const bananas = Math.round((kcal / 89) * 10) / 10;
  if (bananas <= 2.5) return `≈ ${bananas} banana${bananas === 1 ? '' : 's'} in calories`;
  const apples = Math.round((kcal / 95) * 10) / 10;
  if (apples <= 4) return `≈ ${apples} apple${apples === 1 ? '' : 's'} in calories`;
  const slices = Math.round(kcal / 79);
  return `≈ ${slices} slices of bread in calories`;
}

export const RealLifeAdviceCard: React.FC<Props> = ({ foods, score, totalCalories }) => {
  const hasPackaged   = foods.some((f) => f.type === 'packaged');
  const hasRestaurant = foods.some((f) => f.type === 'restaurant');
  const allWhole      = foods.length > 0 && foods.every((f) => !f.type || f.type === 'whole_food');

  const gradeColor: Record<string, string> = {
    A: '#4ade80', B: '#a3e635', C: '#fbbf24', D: '#fb923c', E: '#f87171',
  };
  const color = gradeColor[score.grade] ?? '#fbbf24';

  const lines: string[] = [];

  const calEq = calorieEquivalent(totalCalories);
  if (calEq) lines.push(calEq);

  if (score.grade === 'A') {
    lines.push('Solid choice — clean macro balance. Eat freely.');
  } else if (score.grade === 'B') {
    lines.push('Good meal overall. Fine as a regular part of your diet.');
  } else if (score.grade === 'C') {
    lines.push('Reasonable, but watch portion size — not ideal as an everyday meal.');
  } else if (score.grade === 'D') {
    lines.push('High in one or more concern areas. Treat as an occasional meal, not a daily staple.');
  } else {
    lines.push('Significant nutritional concerns — balance with lighter, cleaner meals today.');
  }

  if (allWhole) {
    lines.push('All whole foods — minimal processing. Best choice for daily eating.');
  } else if (hasPackaged) {
    lines.push('Contains packaged items — check ingredients for preservatives and artificial additives.');
  }
  if (hasRestaurant) {
    lines.push('Restaurant food tends to carry hidden sodium and oil — fine occasionally.');
  }

  if (score.sodiumScore < 40) lines.push('High sodium — drink extra water and avoid other salty foods today.');
  if (score.sugarScore < 40)  lines.push('High sugar — this meal alone may push you past your daily sugar budget.');
  if (score.fatScore < 40)    lines.push('High saturated/trans fat — balance with low-fat meals for the rest of the day.');

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}18`, border: `1px solid ${color}40`,
        }}>
          <span style={{ color, fontSize: 14, fontWeight: 900 }}>{score.grade}</span>
        </div>
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          What This Means For You
        </p>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.55 }}>{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
