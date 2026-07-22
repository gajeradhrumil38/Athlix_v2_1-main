import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Calculator } from 'lucide-react';

interface WeightRepsPickerProps {
  type: 'weight' | 'reps';
  initialValue: number;
  onSelect: (value: number) => void;
  onClose: () => void;
}

export const WeightRepsPicker: React.FC<WeightRepsPickerProps> = ({ type, initialValue, onSelect, onClose }) => {
  const [value, setValue] = useState(initialValue);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const range = type === 'weight' 
    ? Array.from({ length: 401 }, (_, i) => i * 0.5) // 0 to 200kg in 0.5kg steps
    : Array.from({ length: 101 }, (_, i) => i); // 0 to 100 reps

  useEffect(() => {
    if (scrollRef.current) {
      const index = range.indexOf(initialValue);
      if (index !== -1) {
        scrollRef.current.scrollTop = index * 40;
      }
    }
  }, [initialValue, range]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const index = Math.round(e.currentTarget.scrollTop / 40);
    if (range[index] !== undefined) {
      setValue(range[index]);
    }
  };

  const handleSnap = (e: React.UIEvent<HTMLDivElement>) => {
    const index = Math.round(e.currentTarget.scrollTop / 40);
    e.currentTarget.scrollTo({ top: index * 40, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[480px] bg-[var(--bg-surface)] rounded-t-[24px] flex flex-col border-t border-[var(--border)]"
        style={{ height: '50%' }}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <button onClick={onClose} className="p-2 text-[var(--text-muted)]">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">
            Set {type === 'weight' ? 'Weight' : 'Reps'}
          </h2>
          <button 
            onClick={() => onSelect(value)}
            className="p-2 text-[var(--accent)] font-bold text-[14px]"
          >
            Done
          </button>
        </div>

        {/* Picker Area */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {/* Selection Indicator */}
          <div className="absolute inset-x-0 h-10 border-y border-[var(--accent)]/20 bg-[var(--accent)]/5 pointer-events-none" />
          
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            onScrollEnd={handleSnap}
            className="w-full h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-[120px]"
          >
            {range.map((v, i) => (
              <div 
                key={v}
                className={`font-victory h-10 flex items-center justify-center text-[24px] font-bold tabular-nums transition-all snap-center ${value === v ? 'text-[var(--accent)] scale-125' : 'text-[var(--text-muted)] opacity-40'}`}
              >
                {v}{type === 'weight' ? 'kg' : ''}
              </div>
            ))}
          </div>

          {/* Unit Label */}
          <div className="absolute right-12 text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-widest pointer-events-none">
            {type === 'weight' ? 'Kilograms' : 'Repetitions'}
          </div>
        </div>

        {/* Plate Calculator Toggle */}
        {type === 'weight' && (
          <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-base)]">
            <button 
              onClick={() => setShowPlateCalc(!showPlateCalc)}
              className="w-full py-3 bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] rounded-xl font-bold text-[12px] flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" /> Plate Calculator
            </button>
          </div>
        )}

        {/* Plate Calculator Overlay */}
        <AnimatePresence>
          {showPlateCalc && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-[var(--bg-surface)] z-10 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Plate Calculator</h3>
                <button onClick={() => setShowPlateCalc(false)} className="p-2 text-[var(--text-muted)]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="font-victory text-[48px] font-extrabold text-[var(--accent)] mb-2">{value}kg</div>
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest mb-8">Total Weight (20kg Bar)</div>

                <div className="flex gap-2 flex-wrap justify-center max-w-[300px]">
                  {/* Mock plate calculation logic */}
                  {[20, 20, 10, 5, 2.5].map((p, i) => (
                    <div key={i} className="w-12 h-12 rounded-full border-2 border-[var(--border)] flex items-center justify-center bg-[var(--bg-elevated)] text-[12px] font-bold text-[var(--text-primary)]">
                      {p}
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setShowPlateCalc(false)}
                className="w-full py-4 bg-[var(--accent)] text-black rounded-xl font-bold text-[14px]"
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
