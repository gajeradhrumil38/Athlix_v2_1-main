import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { ExercisePicker } from '../log/ExercisePicker';
import { assignPlan, type NewPlanExercise } from '../../lib/assignedPlans';
import type { TraineeWorkout } from '../../lib/coachData';

// Trainer builds a program: exercises picked (multi-select) from the SAME
// searchable catalog the athlete uses, each prescribed with sets/reps/weight/
// rest via logger-style tiles — pre-filled from the trainee's last session so
// the coach starts from real numbers — reorderable, then assigned in one tap.
interface Props { open: boolean; traineeId: string; traineeName: string; traineeWorkouts?: TraineeWorkout[]; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: number; reps: number; weight: number; rest: number; note: string };

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, traineeWorkouts = [], onClose, onAssigned }) => {
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const reset = () => { setTitle(''); setRows([]); setError(''); setBusy(false); setPicking(false); };
  const close = () => { onClose(); reset(); };

  const set = (i: number, k: 'sets' | 'reps' | 'weight' | 'rest', v: number) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const setNote = (i: number, v: string) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, note: v } : r));
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setRows((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const next = [...p]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  // The trainee's last logged top set for an exercise — so a prescription
  // starts from what they actually did, not a blank guess.
  const lastSetFor = (name: string): { weight: number; reps: number } | null => {
    const lower = name.toLowerCase();
    const ordered = [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date));
    for (const w of ordered) {
      const rows = (w.exercises || []).filter((e) => e.name.toLowerCase() === lower);
      if (rows.length) {
        const top = rows.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
        return { weight: Math.round(top.weight), reps: top.reps };
      }
    }
    return null;
  };
  const addExercise = (name: string, sets?: number, reps?: number) =>
    setRows((p) => {
      if (p.some((r) => r.name.toLowerCase() === name.toLowerCase())) return p; // no dupes
      const last = lastSetFor(name);
      return [...p, { name, sets: sets || 3, reps: last?.reps || reps || 10, weight: last?.weight || 0, rest: 90, note: '' }];
    });

  const submit = async () => {
    setBusy(true); setError('');
    const exercises: NewPlanExercise[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.weight, rest: r.rest, note: r.note }));
    const res = await assignPlan(traineeId, { title, exercises });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not assign.'); return; }
    onAssigned();
    close();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={close}
          style={{ background: 'rgba(3,5,9,0.94)' }}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 440, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-6 pt-6 pb-3">
              <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">Assign a plan</h2>
              <p className="text-[15px] text-[var(--text-secondary)] mt-1">For {traineeName}</p>
            </div>

            <div className="px-6 overflow-y-auto flex-1">
              <input
                placeholder="Plan name — e.g. Push Day"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(''); }}
                className="w-full h-13 py-3.5 rounded-2xl px-4 text-[17px] font-semibold outline-none mb-4"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />

              {rows.length === 0 ? (
                <p className="text-[14px] text-[var(--text-muted)] text-center py-6 leading-snug">
                  No exercises yet.<br />Tap <span className="text-[var(--text-secondary)] font-medium">Add exercise</span> to search the library.
                </p>
              ) : (
                <div className="space-y-3">
                  {rows.map((r, i) => (
                    <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 text-[12px] font-bold w-5 text-center text-[var(--text-muted)]">{i + 1}</span>
                        <p className="flex-1 text-[16px] font-semibold text-[var(--text-primary)] truncate">{r.name}</p>
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-secondary)] disabled:opacity-25">
                          <AppIcon name="ExpandDown" size="sm" /><span className="sr-only">up</span>
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-secondary)] disabled:opacity-25 rotate-180">
                          <AppIcon name="ExpandDown" size="sm" />
                        </button>
                        <button type="button" onClick={() => removeRow(i)} aria-label="Remove"
                          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: '#ff8080' }}>
                          <AppIcon name="Trash" size="sm" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <PrescribeTile label="Sets" value={r.sets} min={1} max={20} step={1} onChange={(v) => set(i, 'sets', v)} />
                        <PrescribeTile label="Reps" value={r.reps} min={1} max={100} step={1} onChange={(v) => set(i, 'reps', v)} />
                        <PrescribeTile label="Weight" value={r.weight} min={0} max={2000} step={5} unit="lb" onChange={(v) => set(i, 'weight', v)} />
                        <PrescribeTile label="Rest" value={r.rest} min={0} max={600} step={15} unit="s" onChange={(v) => set(i, 'rest', v)} />
                      </div>
                      <input
                        value={r.note}
                        onChange={(e) => setNote(i, e.target.value)}
                        placeholder="Coaching note — tempo, RPE, cue… (optional)"
                        className="w-full h-10 mt-2 rounded-xl px-3 text-[13px] outline-none"
                        style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      />
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

              {error && <p className="text-[14px] mt-3" style={{ color: '#ff8080' }}>{error}</p>}
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {busy ? <AppIcon name="Spinner" size="md" /> : 'Assign plan'}
              </button>
            </div>
          </motion.div>

          {/* Searchable catalog — the exact picker the athlete uses */}
          {picking && (
            <div className="fixed inset-0 z-[80]" onClick={(e) => e.stopPropagation()}>
              <ExercisePicker
                recentExercises={[]}
                defaultTab="muscle"
                multiSelect
                onSelect={(ex) => addExercise(ex.name, ex.defaultSets, ex.defaultReps)}
                onClose={() => setPicking(false)}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Prescribe tile — same tactile −/value/+ language as the workout logger's
// SetRow, so building a program feels like logging a set.
const PrescribeTile: React.FC<{ label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step, unit, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const bump = (d: number) => { haptics.tick(); onChange(clamp(value + d * step)); };
  return (
    <div className="relative flex h-[66px] w-full overflow-hidden rounded-xl border" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      <button type="button" onClick={() => bump(-1)} disabled={value <= min} aria-label={`Decrease ${label}`}
        className="flex h-full w-[42px] shrink-0 items-center justify-center active:bg-white/[0.04] transition-colors disabled:opacity-30"
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[22px] font-light leading-none select-none">−</span>
      </button>
      <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-[2px]">
        <div className="font-victory tabular-nums text-[26px] leading-none font-black text-[var(--text-primary)]">
          {value}{unit && <span className="text-[12px] font-semibold text-[var(--text-muted)]"> {unit}</span>}
        </div>
        <div className="text-[9px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">{label}</div>
      </div>
      <button type="button" onClick={() => bump(1)} disabled={value >= max} aria-label={`Increase ${label}`}
        className="flex h-full w-[42px] shrink-0 items-center justify-center active:bg-white/[0.04] transition-colors disabled:opacity-30"
        style={{ color: 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[22px] font-light leading-none select-none">+</span>
      </button>
    </div>
  );
};
