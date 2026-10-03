import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { DialPicker } from '../log/DialPicker';
import { assignPlan, updatePlan, type AssignedPlan, type NewPlanExercise } from '../../lib/assignedPlans';
import { saveTemplate } from '../../lib/supabaseData';
import { useAuth } from '../../contexts/AuthContext';
import type { TraineeWorkout } from '../../lib/coachData';
import type { DialFieldKind } from '../../lib/exerciseTypes';
import { DEFAULT_REST, DEFAULT_SETS, DEFAULT_REPS, lastSetLookup, type PlanStarter } from '../../lib/planStarters';
import { AssignStartStep } from './assign/AssignStartStep';
import { AssignPreviewStep } from './assign/AssignPreviewStep';
import { PlanExerciseRow, type DialField } from './assign/PlanExerciseRow';

// Coach assigns (or edits) a plan in three steps: pick a starting point →
// adjust (compact rows, day tabs, whole-day set/rep chips) → preview exactly
// what the trainee sees, then send. Defaults everywhere, so the fastest path
// is two taps with no typing.
interface Props { open: boolean; traineeId: string; traineeName: string; traineeWorkouts?: TraineeWorkout[]; editingPlan?: AssignedPlan | null; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: number; reps: number; weight: number; rest: number; note: string; dayId: number };
type Day = { id: number; label: string };
type Step = 'start' | 'build' | 'preview';

const SCHEMES: [number, number][] = [[3, 5], [3, 8], [3, 10], [4, 12]];
const DIAL_KIND: Record<DialField, DialFieldKind> = { sets: 'sets', reps: 'reps', weight: 'weight', rest: 'rest' };
const DIAL_LABEL: Record<DialField, string> = { sets: 'Sets', reps: 'Reps', weight: 'Weight', rest: 'Rest' };

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, traineeWorkouts = [], editingPlan, onClose, onAssigned }) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>('start');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState<Day[]>([{ id: 0, label: '' }]);
  const [activeDayId, setActiveDayId] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const nextDayId = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [openDial, setOpenDial] = useState<{ rowIndex: number; field: DialField } | null>(null);
  const lastSetFor = useMemo(() => lastSetLookup(traineeWorkouts), [traineeWorkouts]);
  const coachName = profile?.trainer_display_name || profile?.full_name || null;

  const loadStarter = (s: PlanStarter | null) => {
    const ds = s?.days.length ? s.days : [{ label: '', rows: [] }];
    setTitle(s?.title ?? '');
    setDays(ds.map((d, i) => ({ id: i, label: d.label })));
    setRows(ds.flatMap((d, i) => d.rows.map((r) => ({ ...r, dayId: i }))));
    setActiveDayId(0);
    nextDayId.current = ds.length;
    setExpanded(null);
    setStep('build');
    if (!s) setPicking(true);
  };

  useEffect(() => {
    if (!open) return;
    setError(''); setBusy(false); setMenuOpen(false); setExpanded(null); setOpenDial(null); setPicking(false);
    if (editingPlan) {
      const dayIds = new Map<string, number>();
      const nextRows: Row[] = editingPlan.exercises.map((e) => {
        const label = e.day_label?.trim() || '';
        if (!dayIds.has(label)) dayIds.set(label, dayIds.size);
        return { name: e.name, sets: e.default_sets, reps: e.default_reps, weight: e.default_weight, rest: e.rest_seconds ?? DEFAULT_REST, note: e.note ?? '', dayId: dayIds.get(label)! };
      });
      const nextDays = [...dayIds.entries()].map(([label, id]) => ({ id, label }));
      setTitle(editingPlan.title);
      setMessage(editingPlan.notes ?? '');
      setRows(nextRows);
      setDays(nextDays.length ? nextDays : [{ id: 0, label: '' }]);
      setActiveDayId(0);
      nextDayId.current = Math.max(1, nextDays.length);
      setStep('build');
    } else {
      setTitle(''); setMessage(''); setRows([]); setDays([{ id: 0, label: '' }]); setActiveDayId(0); nextDayId.current = 1;
      setStep('start');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingPlan?.id]);

  const hasContent = rows.length > 0;
  const close = () => { onClose(); setStep('start'); };
  const requestClose = () => {
    if (step !== 'start' && hasContent && !window.confirm('Discard this plan? Your changes will be lost.')) return;
    close();
  };

  const multi = days.length > 1;
  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0];
  const dayRows = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.dayId === activeDay.id);

  const setField = (i: number, k: DialField, v: number) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const setNote = (i: number, v: string) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, note: v } : r)));
  const removeRow = (i: number) => { setRows((p) => p.filter((_, idx) => idx !== i)); setExpanded(null); };
  const move = (i: number, dir: -1 | 1) => setRows((p) => {
    const same = p.map((r, idx) => ({ r, idx })).filter(({ r }) => r.dayId === p[i].dayId);
    const pos = same.findIndex(({ idx }) => idx === i);
    const other = same[pos + dir];
    if (!other) return p;
    const next = [...p];
    [next[i], next[other.idx]] = [next[other.idx], next[i]];
    setExpanded(other.idx);
    return next;
  });
  const applyScheme = (sets: number, reps: number) => {
    haptics.tick();
    setRows((p) => p.map((r) => (r.dayId === activeDay.id ? { ...r, sets, reps } : r)));
  };

  const addDay = () => {
    const id = nextDayId.current++;
    setDays((d) => {
      const first = d.length === 1 && !d[0].label ? [{ ...d[0], label: 'Day 1' }] : d;
      return [...first, { id, label: `Day ${first.length + 1}` }];
    });
    setActiveDayId(id);
    haptics.tick();
  };
  const renameDay = (label: string) => setDays((d) => d.map((g) => (g.id === activeDay.id ? { ...g, label } : g)));
  const removeDay = () => {
    if (days.length <= 1) return;
    const n = dayRows.length;
    if (n && !window.confirm(`Remove ${activeDay.label || 'this day'} and its ${n} exercise${n > 1 ? 's' : ''}?`)) return;
    setRows((p) => p.filter((r) => r.dayId !== activeDay.id));
    const rest = days.filter((g) => g.id !== activeDay.id);
    setDays(rest.length === 1 ? [{ ...rest[0], label: '' }] : rest);
    setActiveDayId(rest[0].id);
    setMenuOpen(false);
  };
  const duplicateDay = () => {
    if (!dayRows.length) return;
    const id = nextDayId.current++;
    setDays((d) => [...d.map((g, i) => (i === 0 && !g.label ? { ...g, label: 'Day 1' } : g)), { id, label: `${activeDay.label || 'Day 1'} copy` }]);
    setRows((p) => [...p, ...dayRows.map(({ r }) => ({ ...r, dayId: id }))]);
    setActiveDayId(id);
    setMenuOpen(false);
  };

  const addExercise = (name: string) => setRows((p) => {
    if (p.some((r) => r.dayId === activeDay.id && r.name.toLowerCase() === name.toLowerCase())) return p;
    const last = lastSetFor(name);
    return [...p, { name, sets: DEFAULT_SETS, reps: last?.reps || DEFAULT_REPS, weight: last?.weight || 0, rest: DEFAULT_REST, note: '', dayId: activeDay.id }];
  });

  const recentExercises = useMemo<Exercise[]>(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const e of w.exercises || []) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: `${e.name}-${w.id}`, name: e.name, muscleGroup: e.muscle_group || 'Other', lastSession: { weight: e.weight, reps: e.reps, date: w.date, sets: e.sets, unit: 'lbs' } });
      }
    }
    return out;
  }, [traineeWorkouts]);

  const saveAsTemplate = async () => {
    setMenuOpen(false);
    if (!user || !rows.length) return;
    try {
      await saveTemplate(user.id, {
        title: title.trim() || 'Untitled plan',
        exercises: rows.map((r, i) => ({ name: r.name, muscle_group: null, default_sets: r.sets, default_reps: r.reps, default_weight: r.weight, order_index: i })),
      });
      toast.success('Saved as a reusable template');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save template.');
    }
  };

  const ordered = days.flatMap((d) => rows.filter((r) => r.dayId === d.id).map((r) => ({ ...r, day: multi ? d.label.trim() : '' })));
  const finalTitle = title.trim() || `${traineeName}'s program`;

  const goPreview = () => {
    setError('');
    if (multi) {
      const used = days.filter((d) => rows.some((r) => r.dayId === d.id)).map((d) => d.label.trim().toLowerCase());
      if (used.some((l) => !l)) { setError('Give every day a name.'); return; }
      if (new Set(used).size !== used.length) { setError('Two days have the same name — rename one.'); return; }
    }
    setStep('preview');
  };

  const draftPlan: AssignedPlan = {
    id: editingPlan?.id ?? 'preview', trainer_id: user?.id ?? '', trainee_id: traineeId, title: finalTitle,
    notes: message.trim() || null, status: 'active', created_at: new Date().toISOString(),
    exercises: ordered.map((r, i) => ({
      name: r.name, muscle_group: null, default_sets: r.sets, default_reps: r.reps, default_weight: r.weight,
      unit: 'lbs', order_index: i, day_label: r.day || null, rest_seconds: r.rest, note: r.note || null,
    })),
  };

  const send = async () => {
    setBusy(true); setError('');
    const exercises: NewPlanExercise[] = ordered.map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.weight, rest: r.rest, note: r.note, day: r.day || undefined }));
    const res = editingPlan
      ? await updatePlan(editingPlan.id, { title: finalTitle, notes: message, exercises })
      : await assignPlan(traineeId, { title: finalTitle, notes: message, exercises });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not send.'); return; }
    toast.success(editingPlan ? 'Plan updated' : `Sent to ${traineeName}`);
    onAssigned();
    close();
  };

  const heading = editingPlan ? 'Edit plan' : step === 'start' ? 'Assign a plan' : step === 'preview' ? 'Preview' : 'Build the plan';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={requestClose} style={{ background: 'rgba(3,5,9,0.94)' }}>
          <motion.div className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 440, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">{heading}</h2>
                <p className="text-[15px] text-[var(--text-secondary)] mt-1">For {traineeName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {step === 'build' && (
                  <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="More"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-[18px] leading-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>⋯</button>
                )}
                <button type="button" onClick={requestClose} aria-label="Close" className="h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  <AppIcon name="Close" size="sm" />
                </button>
              </div>
            </div>

            {menuOpen && step === 'build' && (
              <div className="mx-6 mb-2 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                <button type="button" onClick={saveAsTemplate} disabled={!rows.length} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)] disabled:opacity-40">Save as template</button>
                <button type="button" onClick={duplicateDay} disabled={!dayRows.length} className="w-full px-4 py-3 text-left text-[14px] font-semibold text-[var(--text-primary)] disabled:opacity-40">Duplicate {multi ? activeDay.label || 'day' : 'as a new day'}</button>
                {multi && <button type="button" onClick={removeDay} className="w-full px-4 py-3 text-left text-[14px] font-semibold" style={{ color: '#ff8080' }}>Remove {activeDay.label || 'this day'}</button>}
              </div>
            )}

            <div className="px-6 overflow-y-auto flex-1 pb-4">
              {step === 'start' && <AssignStartStep traineeName={traineeName} traineeWorkouts={traineeWorkouts} onPick={loadStarter} />}

              {step === 'preview' && (
                <AssignPreviewStep plan={draftPlan} coachName={coachName} traineeName={traineeName} message={message} onMessage={setMessage}
                  busy={busy} error={error} isEdit={!!editingPlan} onBack={() => setStep('build')} onSend={send} />
              )}

              {step === 'build' && (
                <>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${traineeName}'s program`}
                    className="w-full h-12 rounded-2xl px-4 text-[16px] font-semibold outline-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                  <p className="text-[12px] text-[var(--text-muted)] mt-2">Each day is one workout. Your trainee does them in order.</p>

                  <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-1 px-1">
                    {multi && days.map((d) => (
                      <button key={d.id} type="button" onClick={() => { setActiveDayId(d.id); setExpanded(null); }}
                        className="shrink-0 px-3 h-9 rounded-xl text-[13px] font-semibold"
                        style={d.id === activeDay.id
                          ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid transparent' }}>
                        {d.label || 'Day'}
                      </button>
                    ))}
                    <button type="button" onClick={addDay} className="shrink-0 px-3 h-9 rounded-xl text-[13px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <AppIcon name="Plus" size="sm" /> Day
                    </button>
                  </div>
                  {multi && (
                    <input value={activeDay.label} onChange={(e) => renameDay(e.target.value)} placeholder="Day name"
                      className="w-full h-9 mt-2 rounded-xl px-3 text-[13px] font-semibold outline-none"
                      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                  )}

                  {dayRows.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] shrink-0">All</span>
                      {SCHEMES.map(([s, r]) => {
                        const active = dayRows.every(({ r: row }) => row.sets === s && row.reps === r);
                        return (
                          <button key={`${s}x${r}`} type="button" onClick={() => applyScheme(s, r)}
                            className="px-2.5 h-8 rounded-lg text-[12px] font-bold tabular-nums"
                            style={active ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                            {s}×{r}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2 mt-3">
                    {dayRows.length === 0 ? (
                      <p className="text-[14px] text-[var(--text-muted)] text-center py-6">No exercises{multi ? ' in this day' : ''} yet.</p>
                    ) : dayRows.map(({ r, i }, pos) => (
                      <PlanExerciseRow key={`${r.name}-${i}`} row={r} index={pos} expanded={expanded === i}
                        isFirst={pos === 0} isLast={pos === dayRows.length - 1}
                        onToggle={() => setExpanded(expanded === i ? null : i)}
                        onChange={(f, v) => setField(i, f, v)} onNote={(v) => setNote(i, v)}
                        onOpenDial={(f) => setOpenDial({ rowIndex: i, field: f })}
                        onMove={(dir) => move(i, dir)} onRemove={() => removeRow(i)} />
                    ))}
                  </div>

                  <button type="button" onClick={() => setPicking(true)}
                    className="w-full h-12 mt-3 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
                    style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
                    <AppIcon name="Search" size="sm" /> Add exercise{multi && activeDay.label ? ` to ${activeDay.label}` : ''}
                  </button>
                  {error && <p className="text-[14px] mt-2" style={{ color: '#ff8080' }}>{error}</p>}
                </>
              )}
            </div>

            {step === 'build' && (
              <div className="px-6 pt-2 pb-6">
                <button type="button" disabled={!rows.length} onClick={goPreview}
                  className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  Preview & send
                </button>
              </div>
            )}
          </motion.div>

          {picking && (
            <div className="fixed inset-0 z-[80]" onClick={(e) => e.stopPropagation()}>
              <ExercisePicker recentExercises={recentExercises} defaultTab="recent" multiSelect
                contextLabel={multi ? `Adding to ${activeDay.label || 'this day'}` : `Adding to ${traineeName}'s plan`}
                onSelect={(ex) => addExercise(ex.name)}
                onLoadTemplate={(exs) => { exs.forEach((ex) => addExercise(ex.name)); setPicking(false); }}
                onClose={() => setPicking(false)} />
            </div>
          )}

          {openDial && rows[openDial.rowIndex] && (
            <DialPicker title={DIAL_LABEL[openDial.field]} fieldKind={DIAL_KIND[openDial.field]} inputType="weight_reps"
              initialValue={rows[openDial.rowIndex][openDial.field]} weightUnit="lbs"
              onClose={() => setOpenDial(null)}
              onConfirm={(v) => { setField(openDial.rowIndex, openDial.field, v); setOpenDial(null); }} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
