import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { muscleColor } from '../../lib/muscleColors';
import { exerciseDone, exerciseSummary } from '../../lib/sessionChecklist';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import {
  formatSetValue, getFieldKinds, getInputLabels, resolveEffectiveInputType,
  type DialFieldKind, type ExerciseInputType,
} from '../../lib/exerciseTypes';
import { SetRow } from '../log/SetRow';
import { SetSeparator } from '../log/ExerciseContent';
import { DialPicker } from '../log/DialPicker';
import type { ExerciseEntry } from '../../pages/Log';
import { confirmDialog } from '../shared/ConfirmDialog';

interface DialState {
  setId: string;
  field: 'weight' | 'reps';
  fieldKind: DialFieldKind;
  title: string;
  currentValue: number;
}

// One exercise on a session card: one tap marks it done; tap the row to edit
// its sets with the SAME set rows, steppers and dial as the full logger.
interface Props {
  exercise: ExerciseEntry;
  isNext: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onDone: () => void;
  onUndo: () => void;
  onToggleSet: (setId: string) => void;
  onChangeSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onSetRpe?: (setId: string, rpe: number | null) => void;
  onAddSet: () => void;
  onCopySet: (setId: string) => void;
  onRemoveSet: (setId: string) => void;
}

const bindingFor = (type: ExerciseInputType) =>
  type === 'reps_only' ? { primary: 'reps' as const, secondary: null }
    : type === 'distance_only' ? { primary: 'weight' as const, secondary: null }
    : { primary: 'weight' as const, secondary: 'reps' as const };

// Entered value, else the plan's target — what the trainee would do by default.
const valueOf = (s: ExerciseEntry['sets'][number], f: 'weight' | 'reps') =>
  s[f] ?? (f === 'weight' ? s.planned_weight : s.planned_reps) ?? null;

export const SessionExerciseRow: React.FC<Props> = ({
  exercise, isNext, expanded, onToggleExpand, onDone, onUndo, onToggleSet, onChangeSet, onSetRpe, onAddSet, onCopySet, onRemoveSet,
}) => {
  const { overrides } = useExerciseOverrides();
  const done = exerciseDone(exercise);
  const ticked = exercise.sets.filter((s) => s.done).length;
  const color = muscleColor(exercise.muscleGroup);

  const type = useMemo<ExerciseInputType>(() => {
    const base = resolveEffectiveInputType(exercise.name, overrides);
    return exercise.optionalWeight && base === 'reps_only' ? 'weight_reps' : base;
  }, [exercise.name, exercise.optionalWeight, overrides]);
  const binding = bindingFor(type);
  const kinds = getFieldKinds(type);
  const labels = getInputLabels(type, { weightUnit: 'lbs' });

  // The dial opens inline, right under the set that was tapped — inside the
  // card, not as a full-screen sheet.
  const [dial, setDial] = useState<DialState | null>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dial) dialRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [dial]);
  useEffect(() => { if (!expanded) setDial(null); }, [expanded]);

  const openDial = (s: ExerciseEntry['sets'][number], field: 'weight' | 'reps') => {
    const fieldKind = field === binding.primary ? kinds.primary : kinds.secondary;
    if (!fieldKind) return;
    const same = dial?.setId === s.id && dial.field === field;
    setDial(same ? null : {
      setId: s.id, field, fieldKind,
      title: `Select ${field === binding.primary ? labels.primary : labels.secondary || 'Value'}`,
      currentValue: Number(valueOf(s, field) || 0),
    });
  };

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: isNext ? 'color-mix(in srgb, var(--text-primary) 6.5%, transparent)' : 'color-mix(in srgb, var(--text-primary) 4.5%, transparent)', opacity: done && !expanded ? 0.62 : 1 }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-3 pl-4 pr-3 py-3">
        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-bold text-[var(--text-primary)] truncate" style={done ? { textDecoration: 'line-through' } : undefined}>{exercise.name}</p>
            {isNext && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md" style={{ background: 'var(--accent)', color: '#000' }}>Up next</span>}
          </div>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>{exercise.muscleGroup}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 tabular-nums">
            {exerciseSummary(exercise)}{ticked > 0 && !done ? ` · ${ticked}/${exercise.sets.length} sets` : ''}
            <span className="text-[var(--text-muted)]"> · {expanded ? 'tap to close' : 'tap to edit'}</span>
          </p>
          {exercise.note && <p className="text-[12px] mt-1 leading-snug italic" style={{ color: 'var(--text-secondary)' }}>{exercise.note}</p>}
        </button>
        <button
          type="button"
          onClick={() => { haptics.tick(); if (done) { onUndo(); } else { onDone(); } }}
          aria-label={done ? `Undo ${exercise.name}` : `Mark ${exercise.name} done`}
          className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center transition-colors"
          style={done ? { background: 'var(--accent)', color: '#000' } : { background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)', color: 'var(--text-primary)' }}
        >
          <AppIcon name="Check" size="md" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {exercise.sets.map((s, i) => (
            <React.Fragment key={s.id}>
              <SetRow
                compact
                index={i + 1}
                set={s}
                weightUnit="lbs"
                onMarkDone={() => { haptics.tick(); onToggleSet(s.id); }}
                onSetRpe={onSetRpe ? (rpe) => onSetRpe(s.id, rpe) : undefined}
                onOpenDial={(field) => openDial(s, field)}
                onAdjust={(field, delta) => onChangeSet(s.id, field, Math.max(0, parseFloat((Number(valueOf(s, field) || 0) + delta).toFixed(2))))}
                primary={{ field: binding.primary, label: labels.primary, value: valueOf(s, binding.primary), displayValue: formatSetValue(kinds.primary, valueOf(s, binding.primary)) }}
                secondary={binding.secondary && labels.secondary ? {
                  field: binding.secondary,
                  label: labels.secondary,
                  value: valueOf(s, binding.secondary),
                  displayValue: formatSetValue(kinds.secondary || 'reps', valueOf(s, binding.secondary)),
                } : null}
              />
              <div ref={dial?.setId === s.id ? dialRef : undefined}>
                <AnimatePresence initial={false}>
                  {dial?.setId === s.id && (
                    <DialPicker
                      key={`${dial.setId}-${dial.field}`}
                      inline
                      title={dial.title}
                      fieldKind={dial.fieldKind}
                      inputType={type}
                      initialValue={dial.currentValue}
                      weightUnit="lbs"
                      onClose={() => setDial(null)}
                      onConfirm={(v) => { onChangeSet(dial.setId, dial.field, v); setDial(null); }}
                    />
                  )}
                </AnimatePresence>
              </div>
              <SetSeparator
                soft
                onCopy={() => onCopySet(s.id)}
                onRemove={async () => {
                  if (exercise.sets.length <= 1) return;
                  if (await confirmDialog({ title: `Remove set ${i + 1}?`, confirmLabel: 'Remove', danger: true })) onRemoveSet(s.id);
                }}
              />
            </React.Fragment>
          ))}
          <button type="button" onClick={onAddSet}
            className="h-[46px] w-full rounded-xl text-[14px] font-semibold tracking-[0.06em] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] active:scale-[0.99]"
            style={{ background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)' }}>
            + Add Set
          </button>
        </div>
      )}
    </div>
  );
};
