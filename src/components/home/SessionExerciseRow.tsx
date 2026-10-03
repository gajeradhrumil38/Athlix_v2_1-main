import React from 'react';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { muscleColor } from '../../lib/muscleColors';
import { exerciseDone, exerciseSummary } from '../../lib/sessionChecklist';
import type { ExerciseEntry } from '../../pages/Log';

// One exercise on the Home "Today's session" card: one tap to mark it done,
// tap the row to adjust individual sets.
interface Props {
  exercise: ExerciseEntry;
  isNext: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onDone: () => void;
  onUndo: () => void;
  onToggleSet: (setId: string) => void;
  onChangeSet: (setId: string, field: 'weight' | 'reps', value: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
}

export const SessionExerciseRow: React.FC<Props> = ({ exercise, isNext, expanded, onToggleExpand, onDone, onUndo, onToggleSet, onChangeSet, onAddSet, onRemoveSet }) => {
  const done = exerciseDone(exercise);
  const ticked = exercise.sets.filter((s) => s.done).length;
  const color = muscleColor(exercise.muscleGroup);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: `1px solid ${isNext ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)'}`, opacity: done && !expanded ? 0.62 : 1 }}>
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
          </p>
          {exercise.note && <p className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--accent)' }}>{exercise.note}</p>}
        </button>
        <button
          type="button"
          onClick={() => { haptics.tick(); if (done) { onUndo(); } else { onDone(); } }}
          aria-label={done ? `Undo ${exercise.name}` : `Mark ${exercise.name} done`}
          className="shrink-0 h-11 w-11 rounded-full flex items-center justify-center transition-colors"
          style={done ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1.5px solid var(--border)' }}
        >
          <AppIcon name="Check" size="md" />
        </button>
      </div>

      {expanded && (
        <div className="pl-4 pr-3 pb-3 space-y-1.5">
          {exercise.sets.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-[12px] font-bold text-[var(--text-muted)]">{i + 1}</span>
              <Stepper value={s.weight ?? s.planned_weight ?? 0} suffix="lb" step={5} onChange={(v) => onChangeSet(s.id, 'weight', v)} />
              <Stepper value={s.reps ?? s.planned_reps ?? 0} suffix="reps" step={1} onChange={(v) => onChangeSet(s.id, 'reps', v)} />
              <button type="button" onClick={() => onToggleSet(s.id)} aria-label={`Set ${i + 1} done`}
                className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
                style={s.done ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                <AppIcon name="Check" size="sm" />
              </button>
              <button type="button" onClick={() => onRemoveSet(s.id)} disabled={exercise.sets.length <= 1} aria-label={`Remove set ${i + 1}`}
                className="shrink-0 h-8 w-6 flex items-center justify-center disabled:opacity-25" style={{ color: '#ff8080' }}>
                <AppIcon name="Close" size="sm" />
              </button>
            </div>
          ))}
          <button type="button" onClick={onAddSet} className="text-[12px] font-semibold text-[var(--accent)] pl-7 pt-1">+ Set</button>
        </div>
      )}
    </div>
  );
};

const Stepper: React.FC<{ value: number; suffix: string; step: number; onChange: (v: number) => void }> = ({ value, suffix, step, onChange }) => (
  <div className="flex-1 min-w-0 flex items-center h-8 rounded-lg overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
    <button type="button" onClick={() => onChange(Math.max(0, value - step))} className="w-7 h-full text-[16px] text-[var(--text-muted)]">−</button>
    <span className="flex-1 text-center text-[13px] font-bold tabular-nums text-[var(--text-primary)] truncate">{value}<span className="text-[10px] font-medium text-[var(--text-muted)] ml-0.5">{suffix}</span></span>
    <button type="button" onClick={() => onChange(value + step)} className="w-7 h-full text-[16px]" style={{ color: 'var(--accent)' }}>+</button>
  </div>
);
