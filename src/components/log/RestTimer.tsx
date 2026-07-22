import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, SkipForward } from 'lucide-react';

interface RestTimerProps {
  duration: number;
  exerciseName: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const RestTimer: React.FC<RestTimerProps> = ({ duration, exerciseName, onComplete, onSkip }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    if (timeLeft <= 0) {
      onComplete();
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, timeLeft, onComplete]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const presets = [60, 90, 120, 180];

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      className="flex-shrink-0 mx-2.5 my-1.5 bg-[var(--bg-surface)] border border-[#EF9F27]/35 rounded-xl p-2 flex items-center gap-2 shadow-lg"
    >
      <div className="flex flex-col items-center min-w-[40px]">
        <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase tracking-widest leading-none mb-0.5">REST</span>
        <span className="font-victory text-[16px] font-black text-[#EF9F27] tabular-nums leading-none">
          {formatTime(timeLeft)}
        </span>
      </div>

      <div className="flex-1 flex gap-1 items-center justify-center">
        {presets.map(p => (
          <button
            key={p}
            onClick={() => setTimeLeft(p)}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${timeLeft === p ? 'bg-[#EF9F27]/15 text-[#EF9F27] border border-[#EF9F27]/40' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}
          >
            {p/60}m
          </button>
        ))}
      </div>

      <button 
        onClick={onSkip}
        className="p-2 text-[var(--text-muted)] hover:text-[#EF9F27] transition-colors"
      >
        <SkipForward className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
