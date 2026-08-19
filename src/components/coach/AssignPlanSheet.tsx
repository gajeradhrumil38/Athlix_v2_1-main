import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { Stepper } from '../shared/Stepper';
import { ExercisePicker } from '../log/ExercisePicker';
import { assignPlan, type NewPlanExercise } from '../../lib/assignedPlans';

// Trainer builds a program: exercises picked from the SAME searchable catalog the
// athlete uses, each prescribed with sets / reps / weight / rest via the shared
// Stepper, reorderable, then assigned in one tap.
interface Props { open: boolean; traineeId: string; traineeName: string; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: number; reps: number; weight: number; rest: number };

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, onClose, onAssigned }) => {
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const reset = () => { setTitle(''); setRows([]); setError(''); setBusy(false); setPicking(false); };
  const close = () => { onClose(); reset(); };

  const set = (i: number, k: keyof Row, v: number) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => setRows((p) => {
    const j = i + dir;
    if (j < 0 || j >= p.length) return p;
    const next = [...p]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  const addExercise = (name: string, sets?: number, reps?: number) =>
    setRows((p) => [...p, { name, sets: sets || 3, reps: reps || 10, weight: 0, rest: 90 }]);

  const submit = async () => {
    setBusy(true); setError('');
    const exercises: NewPlanExercise[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.weight, rest: r.rest }));
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
                      <div className="grid grid-cols-2 gap-2 mt-2.5">
                        <Stepper label="Sets" value={r.sets} min={1} max={20} onChange={(v) => set(i, 'sets', v)} />
                        <Stepper label="Reps" value={r.reps} min={1} max={100} onChange={(v) => set(i, 'reps', v)} />
                        <Stepper label="Weight" value={r.weight} min={0} max={2000} step={5} unit="lb" onChange={(v) => set(i, 'weight', v)} />
                        <Stepper label="Rest" value={r.rest} min={0} max={600} step={15} unit="s" onChange={(v) => set(i, 'rest', v)} />
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
