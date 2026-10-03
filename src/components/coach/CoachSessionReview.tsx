import React from 'react';
import { format } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { CenterModal } from '../shared/CenterModal';
import { setsToSave } from '../../lib/sessionChecklist';
import type { WorkoutState } from '../../pages/Log';

// "Save to <name>'s log" review — shared by the coach Overview card and the
// full coach logger so both save the same way.
interface Props {
  open: boolean;
  onClose: () => void;
  traineeName: string;
  workout: WorkoutState;
  onTitle: (title: string) => void;
  saving: boolean;
  onSave: () => void;
}

export const CoachSessionReview: React.FC<Props> = ({ open, onClose, traineeName, workout, onTitle, saving, onSave }) => {
  const items = open ? setsToSave(workout) : [];
  const totalSets = items.reduce((n, x) => n + x.sets.length, 0);
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done));
  return (
    <CenterModal open={open} onClose={onClose} zIndex={60}>
      <div className="p-6 overflow-y-auto">
        <h2 className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">Save to {traineeName}&apos;s log</h2>
        <p className="text-[14px] text-[var(--text-secondary)] mt-1">
          {format(new Date(workout.startAt), 'EEE, MMM d')} · {items.length} exercise{items.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
        </p>
        <input value={workout.title} onChange={(e) => onTitle(e.target.value)} placeholder="Session name (optional)"
          className="w-full h-12 rounded-2xl px-4 mt-4 text-[15px] font-semibold outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
        <div className="mt-3 max-h-[36vh] overflow-y-auto rounded-2xl divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
          {items.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-[var(--text-muted)]">No sets with weight or reps yet.</p>
          ) : items.map(({ exercise, sets }) => (
            <div key={exercise.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{exercise.name}</p>
              <p className="text-[12px] text-[var(--text-muted)] shrink-0 tabular-nums">
                {sets.map((s) => (s.weight ? `${s.weight}×${s.reps ?? 0}` : `${s.reps ?? 0}`)).join(' · ')}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mt-2">
          {anyDone ? 'Only ticked sets are saved.' : 'Every set with a value is saved — tick sets to save only those.'} Weights in lb.
        </p>
        <button type="button" disabled={saving || items.length === 0} onClick={onSave}
          className="w-full h-13 py-3.5 mt-4 rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#000' }}>
          {saving ? <AppIcon name="Spinner" size="md" /> : 'Save session'}
        </button>
        <button type="button" disabled={saving} onClick={onClose} className="w-full h-11 mt-2 rounded-2xl text-[14px] font-semibold text-[var(--text-secondary)]">
          Keep editing
        </button>
      </div>
    </CenterModal>
  );
};
