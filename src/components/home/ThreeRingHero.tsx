import React from 'react';
import { motion } from 'framer-motion';

interface RingProps {
  value: number; // 0 to 100
  color: string;
  label: string;
  subLabel: string;
  delay?: number;
}

const Ring: React.FC<RingProps> = ({ value, color, label, subLabel, delay = 0 }) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 100) / 100;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[88px] h-[88px] mb-2">
        <svg viewBox="0 0 88 88" className="w-full h-full transform -rotate-90">
          {/* Background Ring */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth="8"
          />
          {/* Progress Ring */}
          <motion.circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut", delay }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-victory text-[22px] font-bold text-white leading-none">{value.toFixed(0)}</span>
          {/* <span className="text-[10px] text-[var(--text-muted)] mt-0.5">%</span> */}
        </div>
      </div>
      <span className="text-[11px] font-bold text-white tracking-wide">{label}</span>
      <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider mt-0.5">{subLabel}</span>
    </div>
  );
};

export const ThreeRingHero: React.FC<{ volume: number, recovery: number, strain: number }> = ({ volume, recovery, strain }) => {
  return (
    <div className="flex justify-between items-center px-4 py-6 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl animate-card-enter" style={{ animationDelay: '60ms' }}>
      <Ring value={volume} color="var(--ring-volume)" label="VOLUME" subLabel="Optimal" delay={0.1} />
      <Ring value={recovery} color="var(--ring-recovery)" label="RECOVERY" subLabel="Adequate" delay={0.2} />
      <Ring value={strain} color="var(--ring-strain)" label="STRAIN" subLabel="Building" delay={0.3} />
    </div>
  );
};
