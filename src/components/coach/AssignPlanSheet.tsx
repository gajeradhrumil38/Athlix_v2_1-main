import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { assignPlan, type NewPlanExercise } from '../../lib/assignedPlans';

// Trainer builds a plan: a name + a list of exercises (name, sets, reps, weight).
// Deliberately simple — big fields, add/remove rows, one Assign button.
interface Props { open: boolean; traineeId: string; traineeName: string; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: string; reps: string; weight: string };
const blankRow = (): Row => ({ name: '', sets: '3', reps: '10', weight: '' });

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, onClose, onAssigned }) => {
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setTitle(''); setRows([blankRow()]); setError(''); setBusy(false); };
  const close = () => { onClose(); reset(); };

  const update = (i: number, k: keyof Row, v: string) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows((p) => [...p, blankRow()]);
  const removeRow = (i: number) => setRows((p) => p.length === 1 ? p : p.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true); setError('');
    const exercises: NewPlanExercise[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, sets: Number(r.sets), reps: Number(r.reps), weight: Number(r.weight) }));
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
          style={{ background: 'rgba(0,0,0,0.6)' }}
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

              <div className="space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Exercise"
                        value={r.name}
                        onChange={(e) => update(i, 'name', e.target.value)}
                        className="flex-1 h-11 rounded-xl px-3 text-[16px] outline-none"
                        style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      />
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(i)} aria-label="Remove"
                          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ color: '#ff8080' }}>
                          <AppIcon name="Trash" size="sm" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <NumField label="Sets" value={r.sets} onChange={(v) => update(i, 'sets', v)} />
                      <NumField label="Reps" value={r.reps} onChange={(v) => update(i, 'reps', v)} />
                      <NumField label="Weight" value={r.weight} onChange={(v) => update(i, 'weight', v)} />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRow}
                className="w-full h-12 mt-3 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
                style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}
              >
                <AppIcon name="Plus" size="sm" /> Add exercise
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const NumField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 px-1">{label}</label>
    <input
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      className="w-full h-11 rounded-xl px-3 text-[16px] text-center outline-none"
      style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
    />
  </div>
);
