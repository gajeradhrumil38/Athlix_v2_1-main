import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Check, Minus, Plus } from 'lucide-react';

interface WeightRepsModalProps {
  exerciseName: string;
  setNumber: number;
  field: 'weight' | 'reps';
  initialValue: number;
  weightUnit?: 'kg' | 'lbs';
  onConfirm: (value: number) => void;
  onClose: () => void;
}

export const WeightRepsModal: React.FC<WeightRepsModalProps> = ({
  exerciseName,
  setNumber,
  field,
  initialValue,
  weightUnit = 'lbs',
  onConfirm,
  onClose,
}) => {
  const [value, setValue] = useState(initialValue);

  const isWeight = field === 'weight';
  const unit = isWeight ? weightUnit : '';
  
  const stepSmall = isWeight ? (weightUnit === 'kg' ? 2.5 : 5) : 1;
  const stepBig = isWeight ? (weightUnit === 'kg' ? 5 : 10) : 5;

  const weightChips = weightUnit === 'kg'
    ? [20, 40, 60, 80, 100, 120, 140]
    : [45, 65, 95, 115, 135, 155, 185];
  const repChips = [5, 6, 8, 10, 12, 15, 20];
  const chips = isWeight ? weightChips : repChips;

  const handleAdjust = (amount: number) => {
    setValue(prev => Math.max(0, prev + amount));
    if (navigator.vibrate) {
      try { navigator.vibrate(8); } catch (e) {}
    }
  };

  // Plate Calculator logic
  const getPlates = (totalWeight: number) => {
    const barWeight = weightUnit === 'kg' ? 20 : 45;
    let remaining = (totalWeight - barWeight) / 2;
    if (remaining <= 0) return null;

    const standardPlates = weightUnit === 'kg'
      ? [25, 20, 15, 10, 5, 2.5, 1.25]
      : [45, 35, 25, 10, 5, 2.5];
    const breakdown: number[] = [];

    standardPlates.forEach(plate => {
      while (remaining >= plate) {
        breakdown.push(plate);
        remaining -= plate;
      }
    });

    return breakdown;
  };

  const plates = isWeight ? getPlates(value) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col lg-sheet"
    >
      {/* Header */}
      <header className="h-[52px] flex-shrink-0 flex items-center justify-between px-3 border-b border-[var(--border)]">
        <button onClick={onClose} className="p-2 text-[var(--text-secondary)]">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center">
          <div className="text-[13px] font-bold text-[var(--text-primary)]">Set {setNumber}</div>
          <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{exerciseName}</div>
        </div>
        <button 
          onClick={() => onConfirm(value)}
          className="px-4 py-1.5 bg-[var(--accent)] text-black rounded-lg text-[12px] font-bold"
        >
          Done
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-12">
        {/* Big Value Display */}
        <div className="text-center">
          <div className="font-victory text-[72px] font-black text-[var(--text-primary)] leading-none tabular-nums">
            {value}<span className="font-victory text-[24px] font-bold text-[var(--text-muted)] ml-1">{unit}</span>
          </div>
          <div className="text-[12px] font-bold text-[var(--text-muted)] uppercase tracking-[2px] mt-2">
            Target {field}
          </div>
        </div>

        {/* Stepper Row */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleAdjust(-stepBig)}
            className="w-[52px] h-[52px] rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] active:scale-90 transition-transform"
          >
            <span className="text-[18px] font-bold">--</span>
          </button>
          <button 
            onClick={() => handleAdjust(-stepSmall)}
            className="w-[52px] h-[52px] rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] active:scale-90 transition-transform"
          >
            <Minus className="w-6 h-6" />
          </button>
          
          <div className="w-20" /> {/* Spacer for visual balance with the big value above */}

          <button 
            onClick={() => handleAdjust(stepSmall)}
            className="w-[52px] h-[52px] rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] active:scale-90 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
          <button 
            onClick={() => handleAdjust(stepBig)}
            className="w-[52px] h-[52px] rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] active:scale-90 transition-transform"
          >
            <span className="text-[18px] font-bold">++</span>
          </button>
        </div>

        {/* Quick-set Chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-[320px]">
          {chips.map(chip => (
            <button
              key={chip}
              onClick={() => setValue(chip)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all ${value === chip ? 'bg-[var(--accent)] text-black' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}
            >
              {chip}{unit}
            </button>
          ))}
        </div>

        {/* Plate Calculator */}
        {isWeight && (
          <div className="w-full max-w-[320px] p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] text-center">
            <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3">Plate Breakdown (Per Side)</div>
            {plates ? (
              <div className="flex flex-wrap justify-center gap-2">
                <div className="text-[10px] text-[var(--text-secondary)] w-full mb-1">
                  {weightUnit === 'kg' ? '20kg Bar +' : '45lb Bar +'}
                </div>
                {plates.map((p, i) => (
                  <div key={i} className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--accent)]/20 rounded-lg text-[10px] font-bold text-[var(--accent)]">
                    {p}{weightUnit}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-[var(--text-muted)]">
                Empty Bar ({weightUnit === 'kg' ? '20kg' : '45lb'})
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm Button */}
      <div className="p-6">
        <button 
          onClick={() => onConfirm(value)}
          className="w-full py-4 bg-[var(--accent)] text-black rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          Confirm {value}{unit} <Check className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};
