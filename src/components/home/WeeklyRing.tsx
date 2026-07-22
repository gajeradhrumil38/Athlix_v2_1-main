import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface WeeklyRingProps {
  trainedDays: number;
  goalDays: number;
  days: { label: string; date: Date; status: 'trained' | 'rest' | 'future' | 'today-trained' | 'today-rest' }[];
  balanceWarning?: string;
}

export const WeeklyRing: React.FC<WeeklyRingProps> = ({ trainedDays, goalDays, days, balanceWarning }) => {
  const progress = Math.min(trainedDays / goalDays, 1) * 100;

  return (
    <div className="w-full flex flex-col">
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-[var(--text-primary)] leading-none">{trainedDays}</span>
          <span className="text-xs text-[var(--text-secondary)]">/ {goalDays} days</span>
        </div>
        <span className="text-xs font-medium text-[var(--accent)]">{Math.round(progress)}%</span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-3 bg-[var(--bg-elevated)] rounded-full overflow-hidden mb-4 border border-[var(--border)]">
        <motion.div 
          className="h-full bg-[var(--accent)] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>

      <div className="flex justify-between w-full h-24 items-end gap-2 mt-2">
        {days.map((day, i) => {
          let barHeight = "20%";
          let barColor = "bg-[var(--bg-elevated)] border border-[var(--border)]";
          
          switch (day.status) {
            case 'trained':
              barHeight = "100%";
              barColor = "bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]";
              break;
            case 'rest':
              barHeight = "30%";
              barColor = "bg-[var(--bg-elevated)] border border-[var(--border)]";
              break;
            case 'today-trained':
              barHeight = "100%";
              barColor = "bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)] animate-pulse-ring";
              break;
            case 'today-rest':
              barHeight = "30%";
              barColor = "bg-transparent border border-dashed border-[var(--accent)]/50";
              break;
            case 'future':
              barHeight = "20%";
              barColor = "bg-transparent border border-[var(--border)]";
              break;
          }

          return (
            <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full">
              <div className="w-full h-full flex items-end justify-center">
                <motion.div 
                  className={`w-full rounded-t-lg ${barColor}`}
                  initial={{ height: 0 }}
                  animate={{ height: barHeight }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                />
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] font-medium">{day.label}</span>
            </div>
          );
        })}
      </div>

      {balanceWarning && (
        <div className="mt-3 w-full bg-[var(--bg-elevated)] border border-[var(--pr-gold)]/30 rounded-xl px-2 py-1 text-center">
          <span className="text-[9px] text-[var(--pr-gold)] inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {balanceWarning}</span>
        </div>
      )}
    </div>
  );
};
