import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { saveWorkout } from '../../lib/supabaseData';
import type { TraineeWorkout } from '../../lib/coachData';

// The coach recording a session that already happened — e.g. an in-person
// session — directly into the trainee's log. Distinct from AssignPlanSheet
// (which prescribes a future plan): this writes a completed workout, same
// shape a trainee's own log entry would have. Same tactile PrescribeTile
// language as the assign sheet so it feels like the same family of tool.
interface Props { open: boolean; traineeId: string; traineeName: string; traineeWorkouts?: TraineeWorkout[]; onClose: () => void; onLogged: () => void; }

type Row = { name: string; muscleGroup: string; sets: number; reps: number; weight: number };

export const LogForTraineeSheet: React.FC<Props> = ({ open, traineeId, traineeName, traineeWorkouts = [], onClose, onLogged }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const hasContent = title.trim().length > 0 || rows.length > 0;
  const reset = () => { setTitle(''); setDate(new Date().toISOString().slice(0, 10)); setRows([]); setError(''); setBusy(false); setPicking(false); };
  const close = () => { onClose(); reset(); };
  const requestClose = () => {
    if (hasContent && !window.confirm('Discard this session? Your entries will be lost.')) return;
    close();
  };

  const recentExercises: Exercise[] = (() => {
    const ordered = [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of ordered) {
      for (const e of w.exercises || []) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: `${e.name}-${w.id}`, name: e.name, muscleGroup: e.muscle_group || 'Other', lastSession: { weight: e.weight, reps: e.reps, date: w.date, sets: e.sets } });
      }
    }
    return out;
  })();

  const set = (i: number, k: 'sets' | 'reps' | 'weight', v: number) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const addExercise = (name: string, muscleGroup: string) =>
    setRows((p) => {
      if (p.some((r) => r.name.toLowerCase() === name.toLowerCase())) return p;
      const last = [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date))
        .flatMap((w) => w.exercises || [])
        .find((e) => e.name.toLowerCase() === name.toLowerCase());
      return [...p, { name, muscleGroup, sets: 3, reps: last?.reps || 10, weight: Math.round(last?.weight || 0) }];
    });

  const submit = async () => {
    setBusy(true); setError('');
    if (!rows.length) { setError('Add at least one exercise.'); setBusy(false); return; }
    try {
      await saveWorkout(traineeId, {
        title: title.trim() || 'Workout',
        date,
        duration_minutes: 0,
        exercises: rows.map((r) => ({
          name: r.name,
          muscle_group: r.muscleGroup,
          completed_sets: Array.from({ length: r.sets }, () => ({ reps: r.reps, weight: r.weight })),
        })),
        trainee_id: traineeId,
      });
      toast.success('Session logged');
      onLogged();
      close();
    } catch (e: any) {
      setError(e?.message || 'Could not log this session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={requestClose}
          style={{ background: 'rgba(3,5,9,0.94)' }}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 440, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">Log a session</h2>
                <p className="text-[15px] text-[var(--text-secondary)] mt-1">For {traineeName} — records a completed workout</p>
              </div>
              <button type="button" onClick={requestClose} aria-label="Close"
                className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                <AppIcon name="Close" size="sm" />
              </button>
            </div>

            <div className="px-6 overflow-y-auto flex-1">
              <div className="flex gap-2.5 mb-4">
                <input
                  placeholder="Session name — e.g. In-person session"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setError(''); }}
                  className="flex-1 min-w-0 h-13 py-3.5 rounded-2xl px-4 text-[16px] font-semibold outline-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
                <input
                  type="date"
                  value={date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-[132px] shrink-0 h-13 rounded-2xl px-3 text-[14px] font-semibold outline-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>

              {rows.length === 0 ? (
                <p className="text-[14px] text-[var(--text-muted)] text-center py-6 leading-snug">
                  No exercises yet.<br />Tap <span className="text-[var(--text-secondary)] font-medium">Add exercise</span> for what you did together.
                </p>
              ) : (
                <div className="space-y-3">
                  {rows.map((r, i) => (
                    <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="flex items-center gap-1.5">
                        <p className="flex-1 text-[16px] font-semibold text-[var(--text-primary)] truncate">{r.name}</p>
                        <button type="button" onClick={() => removeRow(i)} aria-label="Remove"
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: '#ff8080' }}>
                          <AppIcon name="Trash" size="sm" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <LogTile label="Sets" value={r.sets} min={1} max={20} step={1} onChange={(v) => set(i, 'sets', v)} />
                        <LogTile label="Reps" value={r.reps} min={1} max={100} step={1} onChange={(v) => set(i, 'reps', v)} />
                        <LogTile label="Weight" value={r.weight} min={0} max={2000} step={5} unit="lb" onChange={(v) => set(i, 'weight', v)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPicking(true)}
                className="w-full h-12 mt-3 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
                style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}
              >
                <AppIcon name="Search" size="sm" /> Add exercise
              </button>

              {error && <p className="text-[14px] mt-2" style={{ color: '#ff8080' }}>{error}</p>}
              <div className="h-1" />
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                type="button"
                disabled={busy || rows.length === 0}
                onClick={submit}
                className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {busy ? <AppIcon name="Spinner" size="md" /> : 'Log session'}
              </button>
            </div>
          </motion.div>

          {picking && (
            <div className="fixed inset-0 z-[80]" onClick={(e) => e.stopPropagation()}>
              <ExercisePicker
                recentExercises={recentExercises}
                defaultTab="recent"
                multiSelect
                contextLabel={`Logging for ${traineeName}`}
                onSelect={(ex) => addExercise(ex.name, ex.muscleGroup)}
                onClose={() => setPicking(false)}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const LogTile: React.FC<{ label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step, unit, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const bump = (d: number) => { haptics.tick(); onChange(clamp(value + d * step)); };
  return (
    <div className="relative flex h-[62px] w-full overflow-hidden rounded-xl border" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => bump(-1)} disabled={value <= min} aria-label={`Decrease ${label}`}
        className="flex h-full w-[30px] shrink-0 items-center justify-center active:bg-white/[0.04] transition-colors disabled:opacity-30"
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[18px] font-light leading-none select-none">−</span>
      </button>
      <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-[2px]">
        <div className="font-victory tabular-nums text-[20px] leading-none font-black text-[var(--text-primary)]">
          {value}{unit && <span className="text-[10px] font-semibold text-[var(--text-muted)]"> {unit}</span>}
        </div>
        <div className="text-[8px] font-bold tracking-[0.14em] uppercase text-[var(--text-secondary)]">{label}</div>
      </div>
      <button type="button" onClick={() => bump(1)} disabled={value >= max} aria-label={`Increase ${label}`}
        className="flex h-full w-[30px] shrink-0 items-center justify-center active:bg-white/[0.04] transition-colors disabled:opacity-30"
        style={{ color: 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[18px] font-light leading-none select-none">+</span>
      </button>
    </div>
  );
};
