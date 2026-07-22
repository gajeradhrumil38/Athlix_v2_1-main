import React, { useMemo, useState } from 'react';
import { Copy, X } from 'lucide-react';
import type { ExerciseEntry } from '../../pages/Log';
import { SetRow } from './SetRow';
import {
  DistanceUnit,
  WeightUnit,
  formatSetValue,
  getFieldKinds,
  getInputLabels,
  getUnitDisplay,
  isDistanceExerciseType,
  isWeightExerciseType,
  resolveExerciseInputType,
} from '../../lib/exerciseTypes';

const fmtLastDate = (dateStr?: string): string => {
  if (!dateStr) return 'last session';
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 'last session';
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface ExerciseContentProps {
  exercise: ExerciseEntry;
  optionalWeight?: boolean;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  bodyWeightForMath?: number | null;
  onWeightUnitChange: (unit: WeightUnit) => void;
  onDistanceUnitChange: (unit: DistanceUnit) => void;
  onUpdateSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onMarkSetDone: (setId: string) => void;
  onAddSet: () => void;
  onCopySet: (setIndex: number) => void;
  onRemoveSet: (setIndex: number) => void;
  onClearPrefill: () => void;
  showPrefillBanner: boolean;
  onOpenDial: (setId: string, field: 'weight' | 'reps') => void;
}

const getFieldBinding = (type: ReturnType<typeof resolveExerciseInputType>) => {
  switch (type) {
    case 'reps_only':
      return { primary: 'reps' as const, secondary: null };
    case 'distance_only':
      return { primary: 'weight' as const, secondary: null };
    default:
      return { primary: 'weight' as const, secondary: 'reps' as const };
  }
};

const SetSeparator: React.FC<{ onCopy: () => void; onRemove: () => void }> = ({ onCopy, onRemove }) => (
  <div className="flex items-center gap-2 py-0.5 px-1">
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <button
      type="button"
      onClick={onCopy}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Copy className="w-3 h-3" />
      Copy set
    </button>
    <button
      type="button"
      onClick={onRemove}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.7)', border: '1px solid rgba(248,113,113,0.15)' }}
    >
      <X className="w-3 h-3" />
      Remove
    </button>
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
  </div>
);

export const ExerciseContent: React.FC<ExerciseContentProps> = (props) => {
  const {
    exercise,
    optionalWeight = false,
    weightUnit = 'lbs',
    distanceUnit = 'km',
    bodyWeightForMath = null,
    onWeightUnitChange,
    onDistanceUnitChange,
    onUpdateSet,
    onMarkSetDone,
    onAddSet,
    onCopySet,
    onRemoveSet,
    onClearPrefill,
    showPrefillBanner,
    onOpenDial,
  } = props;

  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  // When user opts into weight tracking for a normally reps-only exercise, treat it as weight_reps
  const exerciseType = useMemo(() => {
    const base = exercise.inputTypeOverride ?? resolveExerciseInputType(exercise.name);
    if (optionalWeight && base === 'reps_only') return 'weight_reps' as const;
    return base;
  }, [exercise.name, exercise.inputTypeOverride, optionalWeight]);
  const inputLabels = useMemo(
    () => getInputLabels(exerciseType, { weightUnit, distanceUnit }),
    [distanceUnit, exerciseType, weightUnit],
  );
  const fieldKinds = useMemo(() => getFieldKinds(exerciseType), [exerciseType]);
  const binding = useMemo(() => getFieldBinding(exerciseType), [exerciseType]);

  const completedSets = useMemo(() => exercise.sets.filter((set) => set.done).length, [exercise.sets]);

  const totalVolume = useMemo(
    () =>
      exerciseType === 'reps_only'
        ? 0
        : exercise.sets
            .filter((set) => set.done)
            .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0),
    [exercise.sets, exerciseType],
  );

  const statUnit = getUnitDisplay(exerciseType, { weightUnit, distanceUnit }).toLowerCase();
  const relativeLoad =
    bodyWeightForMath && bodyWeightForMath > 0 && isWeightExerciseType(exerciseType)
      ? totalVolume / bodyWeightForMath
      : null;

  return (
    <div className="h-full overflow-y-auto bg-transparent pb-24">
      <div className="sticky top-0 z-20 bg-[var(--bg-base)]/90 px-4 pb-3 pt-3 backdrop-blur-xl scroll-fade-header">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="grid grid-cols-3">
            {/* Sets */}
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Sets</div>
              <div className="font-victory text-[20px] font-black text-[var(--text-primary)] tabular-nums leading-none">
                {completedSets}
                <span className="font-victory text-[14px] font-bold text-[var(--text-muted)]">/{exercise.sets.length}</span>
              </div>
            </div>

            {/* divider */}
            <div className="border-l border-r border-[var(--border)] flex flex-col gap-0.5 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Volume</div>
              <div className="font-victory text-[20px] font-black text-[var(--text-primary)] tabular-nums leading-none">
                {totalVolume > 0 ? totalVolume.toLocaleString() : <span className="text-[var(--text-muted)]">—</span>}
              </div>
              {relativeLoad !== null && (
                <div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)] tabular-nums">
                  {relativeLoad.toFixed(2)}x BW
                </div>
              )}
            </div>

            {/* Unit toggle */}
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Unit</div>
              {isWeightExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-[3px]">
                  {(['kg', 'lbs'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onWeightUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-lg px-2 text-[10px] font-bold uppercase transition-all ${
                        weightUnit === unit
                          ? 'border border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {isDistanceExerciseType(exerciseType) && (
                <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-[3px]">
                  {(['km', 'mi'] as const).map((unit) => (
                    <button
                      key={unit}
                      onClick={() => onDistanceUnitChange(unit)}
                      className={`h-6 min-w-[34px] rounded-lg px-2 text-[10px] font-bold uppercase transition-all ${
                        distanceUnit === unit
                          ? 'border border-[var(--accent)]/25 bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              )}
              {!isWeightExerciseType(exerciseType) && !isDistanceExerciseType(exerciseType) && (
                <div className="text-[13px] font-bold text-[var(--text-primary)] uppercase">{statUnit || '—'}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pt-3">
        {showPrefillBanner && exercise.lastSession && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/8 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)]">
                Last session · {fmtLastDate(exercise.lastSession.date)}
              </span>
            </div>
            <button
              onClick={onClearPrefill}
              className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)] transition-colors hover:opacity-85"
            >
              Reset
            </button>
          </div>
        )}

        {exercise.sets.map((set, index) => {
          const primaryField = binding.primary;
          const secondaryField = binding.secondary;

          return (
            <React.Fragment key={set.id}>
              <SetRow
                index={index + 1}
                set={set}
                onMarkDone={() => onMarkSetDone(set.id)}
                onOpenDial={(field) => onOpenDial(set.id, field)}
                onAdjust={(field, delta) => {
                  const cur = set[field] ?? 0;
                  onUpdateSet(set.id, field, Math.max(0, parseFloat((cur + delta).toFixed(2))));
                }}
                weightUnit={weightUnit}
                primary={{
                  field: primaryField,
                  label: inputLabels.primary,
                  value: set[primaryField],
                  displayValue: formatSetValue(fieldKinds.primary, set[primaryField]),
                }}
                secondary={
                  secondaryField && inputLabels.secondary
                    ? {
                        field: secondaryField,
                        label: inputLabels.secondary,
                        value: set[secondaryField],
                        displayValue: formatSetValue(fieldKinds.secondary || 'reps', set[secondaryField]),
                      }
                    : null
                }
              />
              <SetSeparator
                onCopy={() => onCopySet(index)}
                onRemove={() => setConfirmRemoveIndex(index)}
              />
            </React.Fragment>
          );
        })}

        <button
          onClick={onAddSet}
          className="h-[52px] w-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)]/45 text-[14px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] transition-all hover:border-[var(--accent)]/35 hover:text-[var(--accent)] active:scale-[0.99]"
        >
          + Add Set
        </button>

      </div>

      {/* Remove set confirmation */}
      {confirmRemoveIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setConfirmRemoveIndex(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[320px] rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Remove Set {confirmRemoveIndex + 1}?
            </p>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveIndex(null)}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveSet(confirmRemoveIndex);
                  setConfirmRemoveIndex(null);
                }}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
