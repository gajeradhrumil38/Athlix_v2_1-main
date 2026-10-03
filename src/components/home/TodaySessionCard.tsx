import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { useAuth } from '../../contexts/AuthContext';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { getLastExerciseSession } from '../../lib/supabaseData';
import { readDraft } from '../../lib/workoutDraft';
import type { ExerciseEntry, WorkoutState } from '../../pages/Log';
import {
  addExercises, addSet, copySet, markExerciseDone, markExerciseUndone, removeSet, sessionProgress, toggleSetDone, updateSetValue,
} from '../../lib/sessionChecklist';
import { SessionExerciseRow, type SessionDialRequest } from './SessionExerciseRow';
import { DialPicker } from '../log/DialPicker';

interface Props {
  workout: WorkoutState;
  onChange: (next: WorkoutState) => void;
  onDiscard: () => void;
  onOpenLogger: () => void;
  onFinish: () => void;
  // Coach-run sessions: a different heading, prefill from the trainee's
  // history, the trainee's recent exercises, and re-reading the coach draft.
  label?: string;
  historyUserId?: string;
  recentExercises?: Exercise[];
  readCurrent?: () => WorkoutState | null;
  // Leave room for a drag handle in the top-right corner (coach Overview grid).
  menuInset?: boolean;
}

const uid = () => crypto.randomUUID();

// Sets for a newly added exercise, from its last session when the picker knows it.
const setsFrom = (ex: Exercise): ExerciseEntry['sets'] => {
  const per = ex.lastSession?.perSetData;
  if (per?.length) return per.map((s) => ({ id: uid(), weight: s.weight || null, reps: s.reps || null, done: false, planned_weight: s.weight || null, planned_reps: s.reps || null }));
  const n = Math.max(1, Math.min(10, ex.lastSession?.sets || 3));
  const w = ex.lastSession?.weight || null;
  const r = ex.lastSession?.reps || null;
  return Array.from({ length: n }, () => ({ id: uid(), weight: w, reps: r, done: false, planned_weight: w, planned_reps: r }));
};

// Home "Today's session": the in-progress workout as a tick-off list. Same
// draft as the full logger, so either can continue or finish it.
export const TodaySessionCard: React.FC<Props> = ({ workout, onChange, onDiscard, onOpenLogger, onFinish, label, historyUserId, recentExercises, readCurrent, menuInset }) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dial, setDial] = useState<(SessionDialRequest & { exerciseId: string }) | null>(null);
  const p = sessionProgress(workout);

  const addPicked = (picked: Exercise) => {
    const entry: ExerciseEntry = { id: uid(), name: picked.name, muscleGroup: picked.muscleGroup, exercise_db_id: picked.exercise_db_id, sets: setsFrom(picked) };
    onChange(addExercises(workout, [entry]));
    // Catalog picks carry no history — fill from the trainee's last session.
    // Re-read the draft when it arrives (the card may have changed since) and
    // only replace this exercise's sets if they're still untouched.
    if (!picked.lastSession && user) {
      getLastExerciseSession(historyUserId ?? user.id, picked.name).then((res) => {
        const last = res?.lastSession as Exercise['lastSession'] | undefined;
        const current = (readCurrent ?? readDraft)();
        if (!last || !current) return;
        onChange({
          ...current,
          exercises: current.exercises.map((e) =>
            e.id === entry.id && e.sets.every((s) => !s.done) ? { ...e, sets: setsFrom({ ...picked, lastSession: last }) } : e),
        });
      }).catch(() => { /* keep defaults */ });
    }
  };

  return (
    <div className="glass-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{label ?? <>Today&apos;s session</>}</p>
          <p className="text-[18px] font-bold text-[var(--text-primary)] leading-tight truncate mt-0.5">{workout.title || 'Workout'}</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {p.done} of {p.total} done · started {formatDistanceToNowStrict(new Date(workout.startTime), { addSuffix: true })}
          </p>
        </div>
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label="Session options"
          className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[18px] leading-none ${menuInset ? 'mr-8' : ''}`}
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>⋯</button>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%`, background: 'var(--accent)' }} />
      </div>

      {menu && (
        <div className="mt-3 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
          <button type="button" onClick={() => { setMenu(false); onOpenLogger(); }} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)]">Open full logger</button>
          <button type="button" onClick={() => { setMenu(false); onDiscard(); }} className="w-full px-4 py-3 text-left text-[14px] font-semibold" style={{ color: '#ff8080' }}>Discard session</button>
        </div>
      )}

      <div className="mt-3 max-h-[420px] overflow-y-auto space-y-2 -mx-1 px-1">
        {workout.exercises.map((ex, i) => (
          <SessionExerciseRow
            key={ex.id}
            exercise={ex}
            isNext={i === p.nextIndex}
            expanded={expanded === ex.id}
            onToggleExpand={() => setExpanded(expanded === ex.id ? null : ex.id)}
            onDone={() => onChange(markExerciseDone(workout, ex.id))}
            onUndo={() => onChange(markExerciseUndone(workout, ex.id))}
            onToggleSet={(setId) => onChange(toggleSetDone(workout, ex.id, setId))}
            onChangeSet={(setId, field, value) => onChange(updateSetValue(workout, ex.id, setId, field, value))}
            onOpenDial={(req) => setDial({ ...req, exerciseId: ex.id })}
            onAddSet={() => onChange(addSet(workout, ex.id, uid()))}
            onCopySet={(setId) => onChange(copySet(workout, ex.id, setId, uid()))}
            onRemoveSet={(setId) => onChange(removeSet(workout, ex.id, setId))}
          />
        ))}
      </div>

      {workout.exercises.length === 0 && (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-4">No exercises yet — add what you&apos;re doing.</p>
      )}

      <button type="button" onClick={() => setPicking(true)}
        className="w-full h-11 mt-2 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
        style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
        <AppIcon name="Plus" size="sm" /> Add exercise
      </button>
      <button type="button" onClick={onFinish} disabled={!p.anySetDone}
        className="w-full h-12 mt-2 rounded-2xl font-bold text-[15px] disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#000' }}>
        {p.total > 0 && p.done === p.total ? 'Finish session ✓' : 'Finish session'}
      </button>

      {/* Portal: the card's glass background would otherwise trap the
          full-screen picker inside the card. */}
      {/* The logger's scroll-wheel dial; portal for the same reason as the picker. */}
      {dial && createPortal(
        <DialPicker
          title={dial.title}
          fieldKind={dial.fieldKind}
          inputType={dial.inputType}
          initialValue={dial.currentValue}
          weightUnit="lbs"
          onClose={() => setDial(null)}
          onConfirm={(v) => { onChange(updateSetValue(workout, dial.exerciseId, dial.setId, dial.field, v)); setDial(null); }}
        />,
        document.body,
      )}

      {picking && createPortal(
        <ExercisePicker recentExercises={recentExercises ?? []} multiSelect onSelect={addPicked} onClose={() => setPicking(false)} />,
        document.body,
      )}
    </div>
  );
};
