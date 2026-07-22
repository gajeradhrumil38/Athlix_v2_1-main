import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface GoalEditSheetProps {
  current: number;
  onClose: () => void;
  onConfirm: (days: number) => void;
}

export const GoalEditSheet: React.FC<GoalEditSheetProps> = ({ current, onClose, onConfirm }) => {
  const [selected, setSelected] = useState(current);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="goal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        key="goal-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          className="flex flex-col rounded-t-[16px] border-t border-l border-r border-[var(--border)]"
          style={{ background: 'var(--bg-surface)', maxHeight: 'calc(88dvh - env(safe-area-inset-top))' }}
        >
          {/* Drag pill */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1 w-8 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-[15px] font-bold text-[var(--text-primary)]">Weekly Goal</span>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors active:scale-95"
              style={{ border: '1px solid var(--border)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5 py-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Days per week
            </p>
            <p className="mb-4 text-[12px] text-[var(--text-muted)]">
              How many training days do you want to hit each week?
            </p>

            {/* Day selector grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const isActive = selected === day;
                return (
                  <button
                    key={day}
                    onClick={() => setSelected(day)}
                    className="flex flex-col items-center gap-1 rounded-xl py-3 transition-all active:scale-95"
                    style={
                      isActive
                        ? {
                            background: 'var(--accent)',
                            border: '1px solid var(--accent)',
                            boxShadow: '0 0 14px rgba(200,255,0,0.30)',
                          }
                        : {
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                          }
                    }
                  >
                    <span
                      className="font-victory text-[20px] font-black leading-none tabular-nums"
                      style={{ color: isActive ? '#000' : 'var(--text-primary)' }}
                    >
                      {day}
                    </span>
                    <span
                      className="text-[8px] font-bold uppercase tracking-[0.06em]"
                      style={{ color: isActive ? '#000' : 'var(--text-muted)' }}
                    >
                      {day === 1 ? 'day' : 'days'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Context hint */}
            <div className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
              <span className="text-[11px] text-[var(--text-secondary)]">
                {selected <= 3 ? 'Great for recovery-focused training' : selected <= 5 ? 'Balanced training frequency' : 'High-intensity schedule — prioritise recovery'}
              </span>
            </div>
          </div>

          {/* Confirm — pinned outside scroll so always visible */}
          <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => onConfirm(selected)}
              className="w-full rounded-xl text-[14px] font-bold uppercase tracking-[0.08em] text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)', height: 52 }}
            >
              Set Goal
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
