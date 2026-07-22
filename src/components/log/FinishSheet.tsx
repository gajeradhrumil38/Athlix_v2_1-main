import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Trophy, Clock, Weight, Activity } from 'lucide-react';
import type { WorkoutState } from '../../pages/Log';
import { convertWeight, type WeightUnit } from '../../lib/units';
import { isWeightExerciseType, resolveEffectiveInputType } from '../../lib/exerciseTypes';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';

interface FinishSheetProps {
  workout: WorkoutState;
  weightUnit?: 'kg' | 'lbs';
  bodyWeight?: number | null;
  bodyWeightUnit?: WeightUnit;
  onConfirm: (title: string, notes: string) => void;
  onCancel: () => void;
  onAddMore?: () => void;
  saving?: boolean;
}

export const FinishSheet: React.FC<FinishSheetProps> = ({
  workout,
  weightUnit = 'lbs',
  bodyWeight,
  bodyWeightUnit = 'lbs',
  onConfirm,
  onCancel,
  onAddMore,
  saving = false,
}) => {
  const [title, setTitle] = useState(workout.title);
  const [notes, setNotes] = useState(workout.notes || '');
  const { overrides: typeOverrides } = useExerciseOverrides();

  const totalSets = (workout.exercises || []).reduce((acc, ex) => acc + (ex.sets || []).filter(s => s.done).length, 0);
  const totalVolume = (workout.exercises || []).reduce((acc, ex) => {
    const exerciseType = resolveEffectiveInputType(ex.name, typeOverrides);
    if (!isWeightExerciseType(exerciseType)) return acc;
    return acc + (ex.sets || []).filter((s) => s.done).reduce((v, s) => v + Number(s.weight || 0) * Number(s.reps || 0), 0);
  }, 0);
  const prCount = useMemo(
    () =>
      (workout.exercises || []).reduce(
        (count, ex) => count + (ex.sets || []).filter((s) => s.done && Boolean(s.isPR)).length,
        0,
      ),
    [workout.exercises],
  );
  const bodyWeightForMath = useMemo(() => {
    if (!bodyWeight || !Number.isFinite(bodyWeight) || bodyWeight <= 0) return null;
    return convertWeight(bodyWeight, bodyWeightUnit, weightUnit, 0.1);
  }, [bodyWeight, bodyWeightUnit, weightUnit]);
  const relativeLoad = bodyWeightForMath && bodyWeightForMath > 0 ? totalVolume / bodyWeightForMath : null;

  useEffect(() => {
    setTitle(workout.title);
    setNotes(workout.notes || '');
  }, [workout.notes, workout.title]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${(m % 60).toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[480px] lg-sheet rounded-t-[24px] flex flex-col"
        style={{ height: '90%', borderTop: '1px solid rgba(255,255,255,0.13)' }}
      >
        <div className="lg-handle" />
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <button onClick={onCancel} disabled={saving} className="p-2 text-[var(--text-muted)] disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Finish Workout</h2>
          <div className="w-10" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
              <Clock className="w-4 h-4 text-[var(--accent)] mb-2" />
              <div className="font-victory text-[20px] font-extrabold text-[var(--text-primary)] tabular-nums">{formatTime(workout.elapsedSeconds)}</div>
              <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">Duration</div>
            </div>
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
              <Weight className="w-4 h-4 text-[var(--accent)] mb-2" />
              <div className="font-victory text-[20px] font-extrabold text-[var(--text-primary)] tabular-nums">
                {totalVolume.toLocaleString()}
                {weightUnit}
              </div>
              {relativeLoad !== null && (
                <div className="font-victory mt-1 text-[10px] font-semibold text-[var(--text-secondary)] tabular-nums">{relativeLoad.toFixed(2)}x BW</div>
              )}
              <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">Total Volume</div>
            </div>
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
              <Activity className="w-4 h-4 text-[var(--accent)] mb-2" />
              <div className="font-victory text-[20px] font-extrabold text-[var(--text-primary)] tabular-nums">{totalSets}</div>
              <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">Total Sets</div>
            </div>
            <div className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
              <Trophy className="w-4 h-4 text-[var(--pr-gold)] mb-2" />
              <div className="font-victory text-[20px] font-extrabold text-[var(--text-primary)] tabular-nums">{prCount}</div>
              <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">New PRs</div>
            </div>
          </div>

          {/* Title & Notes */}
          <div className="space-y-4">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[var(--text-muted)] mb-2">Workout Title</label>
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                placeholder="Morning Workout"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[var(--text-muted)] mb-2">Notes</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-[14px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors h-24 resize-none"
                placeholder="How did it feel today?"
              />
            </div>
          </div>

          {/* Exercise Summary */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[1.5px] text-[var(--text-muted)] mb-3">Exercise Summary</label>
            <div className="space-y-2">
              {(workout.exercises || []).map(ex => (
                <div key={ex.id} className="flex items-center justify-between p-3 bg-[var(--bg-surface)]/50 rounded-xl">
                  <span className="text-[12px] font-bold text-[var(--text-primary)]">{ex.name}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">{(ex.sets || []).filter(s => s.done).length} sets</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-6 border-t border-[var(--border)]">
          {onAddMore && (
            <button
              type="button"
              disabled={saving}
              onClick={onAddMore}
              className="btn-glow btn-glow-subtle mb-3 w-full py-3.5 text-[var(--text-primary)] font-semibold text-[14px] disabled:opacity-50"
            >
              Add More Exercise
            </button>
          )}
          <button 
            disabled={saving}
            onClick={() => onConfirm(title.trim() || workout.title, notes)}
            className="w-full py-4 bg-[var(--accent)] text-black rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Workout'} <Check className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
