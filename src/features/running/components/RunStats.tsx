import React from 'react';
import { formatPace, formatDuration } from '../utils/gpsCalculations';

interface RunStatsProps {
  distance: number;
  time: number;
  pace: number;
  unit: 'km' | 'mi';
}

interface StatItemProps {
  label: string;
  value: string;
  unit: string;
}

const StatItem: React.FC<StatItemProps> = ({ label, value, unit }) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">{label}</span>
    <span className="font-victory text-[32px] font-black leading-none tabular-nums text-[var(--text-primary)]">
      {value}
    </span>
    <span className="text-[12px] text-[var(--text-muted)]">{unit}</span>
  </div>
);

export const RunStats: React.FC<RunStatsProps> = ({ distance, time, pace, unit }) => {
  const distanceLabel = unit === 'mi' ? distance * 0.621371 : distance;
  const paceLabel = unit === 'mi' ? pace * 1.609344 : pace;

  return (
    <div className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="py-3">
        <StatItem label="Distance" value={distanceLabel.toFixed(2)} unit={unit} />
      </div>
      <div className="py-3">
        <StatItem label="Time" value={formatDuration(time)} unit="duration" />
      </div>
      <div className="py-3">
        <StatItem label="Pace" value={paceLabel > 0 ? formatPace(paceLabel) : '--:--'} unit={`/${unit}`} />
      </div>
    </div>
  );
};
