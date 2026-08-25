import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { haptics } from '../../lib/haptics';
import { ExercisePicker, type Exercise } from '../log/ExercisePicker';
import { assignPlan, updatePlan, type AssignedPlan, type NewPlanExercise } from '../../lib/assignedPlans';
import { saveTemplate } from '../../lib/supabaseData';
import { useAuth } from '../../contexts/AuthContext';
import type { TraineeWorkout } from '../../lib/coachData';

// Trainer builds a program: exercises picked (multi-select) from the SAME
// searchable catalog the athlete uses, each prescribed with sets/reps/weight/
// rest via logger-style tiles — pre-filled from the trainee's last session so
// the coach starts from real numbers — reorderable, then assigned in one tap.
// editingPlan turns this into an edit sheet: pre-filled from the plan, saved
// via updatePlan() instead of assignPlan().
//
// Optional multi-day split ("+ Add day"): a real program is rarely one flat
// list — Push/Pull/Legs, or Day 1/2/3 — so exercises can be grouped into
// named days. A brand-new plan starts as a single unlabeled day and shows
// none of this chrome until the coach actually asks for a second day, so a
// simple one-session plan stays exactly as simple as before.
interface Props { open: boolean; traineeId: string; traineeName: string; traineeWorkouts?: TraineeWorkout[]; editingPlan?: AssignedPlan | null; onClose: () => void; onAssigned: () => void; }

type Row = { name: string; sets: number; reps: number; weight: number; rest: number; note: string; dayId: number };
type Day = { id: number; label: string };

export const AssignPlanSheet: React.FC<Props> = ({ open, traineeId, traineeName, traineeWorkouts = [], editingPlan, onClose, onAssigned }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState<Day[]>([{ id: 0, label: '' }]);
  const [activeDayId, setActiveDayId] = useState(0);
  const nextDayId = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Remembers the most recently set rest time so the NEXT exercise added
  // defaults to it instead of always resetting to 90s — a program is
  // usually one rest interval repeated across most exercises, so this
  // saves re-typing the same value over and over while building a plan.
  const lastRestRef = useRef(90);

  const hasContent = title.trim().length > 0 || rows.length > 0;

  const reset = () => {
    setTitle(''); setRows([]); setDays([{ id: 0, label: '' }]); setActiveDayId(0); nextDayId.current = 1;
    setError(''); setBusy(false); setPicking(false); lastRestRef.current = 90;
  };
  const close = () => { onClose(); reset(); };
  // Backdrop tap / picker-cancel used to discard silently — a coach who spent
  // several minutes building an 8-exercise program could lose it all with one
  // misplaced tap outside the sheet. Now it only closes free of charge when
  // there's nothing to lose.
  const requestClose = () => {
    if (hasContent && !window.confirm('Discard this plan? Your changes will be lost.')) return;
    close();
  };

  useEffect(() => {
    if (!open) return;
    if (editingPlan) {
      setTitle(editingPlan.title);
      // Bucket by day_label in first-appearance order — a plan with no days
      // set (every day_label null) collapses back to the single-day case,
      // so old plans built before this feature render exactly as before.
      const dayIds = new Map<string, number>();
      let counter = 0;
      const nextRows: Row[] = editingPlan.exercises.map((e) => {
        const label = e.day_label?.trim() || '';
        if (!dayIds.has(label)) dayIds.set(label, counter++);
        return {
          name: e.name, sets: e.default_sets, reps: e.default_reps, weight: e.default_weight,
          rest: e.rest_seconds ?? 90, note: e.note ?? '', dayId: dayIds.get(label)!,
        };
      });
      const nextDays: Day[] = [...dayIds.entries()].map(([label, id]) => ({ id, label }));
      setRows(nextRows);
      setDays(nextDays.length ? nextDays : [{ id: 0, label: '' }]);
      setActiveDayId(nextDays.length ? nextDays[nextDays.length - 1].id : 0);
      nextDayId.current = counter;
      lastRestRef.current = nextRows[nextRows.length - 1]?.rest ?? 90;
    } else {
      setTitle(''); setRows([]); setDays([{ id: 0, label: '' }]); setActiveDayId(0); nextDayId.current = 1;
      lastRestRef.current = 90;
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingPlan?.id]);

  const set = (i: number, k: 'sets' | 'reps' | 'weight' | 'rest', v: number) => {
    if (k === 'rest') lastRestRef.current = v;
    setRows((p) => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  };
  const setNote = (i: number, v: string) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, note: v } : r));
  const removeRow = (i: number) => setRows((p) => p.filter((_, idx) => idx !== i));
  // Reorder within the row's own day only — dragging past a day boundary via
  // simple up/down arrows would silently reassign an exercise to a different
  // day, which is confusing. Cross-day moves happen by removing + re-adding.
  const move = (i: number, dir: -1 | 1) => setRows((p) => {
    const row = p[i];
    const sameDay = p.map((r, idx) => ({ r, idx })).filter(({ r }) => r.dayId === row.dayId);
    const posInDay = sameDay.findIndex(({ idx }) => idx === i);
    const swapWith = sameDay[posInDay + dir];
    if (!swapWith) return p;
    const next = [...p];
    [next[i], next[swapWith.idx]] = [next[swapWith.idx], next[i]];
    return next;
  });

  const addDay = () => {
    const id = nextDayId.current++;
    setDays((d) => {
      // The very first day is unlabeled until a second one exists — label it
      // "Day 1" retroactively the moment it's no longer the only day.
      const withFirstLabeled = d.length === 1 && !d[0].label ? [{ ...d[0], label: 'Day 1' }] : d;
      return [...withFirstLabeled, { id, label: `Day ${withFirstLabeled.length + 1}` }];
    });
    setActiveDayId(id);
    haptics.tick();
  };
  const renameDay = (id: number, label: string) => setDays((d) => d.map((g) => g.id === id ? { ...g, label } : g));
  const removeDay = (id: number) => {
    if (days.length <= 1) return;
    const dayRows = rows.filter((r) => r.dayId === id);
    if (dayRows.length && !window.confirm(`Remove this day and its ${dayRows.length} exercise${dayRows.length > 1 ? 's' : ''}?`)) return;
    setDays((d) => d.filter((g) => g.id !== id));
    setRows((p) => p.filter((r) => r.dayId !== id));
    if (activeDayId === id) setActiveDayId(days.find((g) => g.id !== id)!.id);
  };
  // Most multi-day programs repeat structure (two similar Push days at
  // different intensities, Upper/Lower alternating) — cloning a day's
  // exercises into a new one is much faster than rebuilding it exercise by
  // exercise. Copies prescriptions as-is; the coach tweaks from there.
  const duplicateDay = (id: number) => {
    const source = days.find((d) => d.id === id);
    const sourceRows = rows.filter((r) => r.dayId === id);
    if (!source || !sourceRows.length) return;
    const newId = nextDayId.current++;
    setDays((d) => [...d, { id: newId, label: `${source.label || 'Day 1'} copy` }]);
    setRows((p) => [...p, ...sourceRows.map((r) => ({ ...r, dayId: newId }))]);
    setActiveDayId(newId);
    haptics.tick();
  };

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
  // What the picker's "Recent" tab shows by default. It used to fall back to
  // the COACH's own personal workout history (ExercisePicker reads whoever
  // is logged in) — actively wrong in a coaching context. This builds the
  // TRAINEE's actual recent exercises instead, most-recent-first, so the
  // fastest path — "add more of what they've been doing" — works and shows
  // the right person's data.
  const recentExercises = useMemo<Exercise[]>(() => {
    const ordered = [...traineeWorkouts].sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of ordered) {
      for (const e of w.exercises || []) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `${e.name}-${w.id}`,
          name: e.name,
          muscleGroup: e.muscle_group || 'Other',
          lastSession: { weight: e.weight, reps: e.reps, date: w.date, sets: e.sets, unit: (e.unit as 'kg' | 'lbs') || 'lbs' },
        });
      }
    }
    return out;
  }, [traineeWorkouts]);

  const addExercise = (name: string, sets?: number, reps?: number) =>
    setRows((p) => {
      // Only guard against re-adding the same exercise to the SAME day by
      // accident — the identical lift on a different day (e.g. Squat on both
      // Day 1 and Day 3) is completely normal programming, not a dupe.
      if (p.some((r) => r.dayId === activeDayId && r.name.toLowerCase() === name.toLowerCase())) return p;
      const last = lastSetFor(name);
      return [...p, { name, sets: sets || 3, reps: last?.reps || reps || 10, weight: last?.weight || 0, rest: lastRestRef.current, note: '', dayId: activeDayId }];
    });

  // Bulk-add every exercise from a saved template into the active day at
  // once (via ExercisePicker's "My Plans" tab) — the reuse side of "save
  // this plan so I can build it again for another trainee".
  const loadFromTemplate = (exercises: Exercise[]) =>
    setRows((p) => {
      const existing = new Set(p.filter((r) => r.dayId === activeDayId).map((r) => r.name.toLowerCase()));
      const additions = exercises
        .filter((ex) => !existing.has(ex.name.toLowerCase()))
        .map((ex) => ({ name: ex.name, sets: ex.defaultSets || 3, reps: ex.defaultReps || 10, weight: ex.defaultWeight || 0, rest: lastRestRef.current, note: '', dayId: activeDayId }));
      return [...p, ...additions];
    });

  // Save the exercises currently in the sheet as a reusable template —
  // under the COACH's own account, so it's available for any future
  // trainee, not just this one. Day-grouping, rest, and notes don't carry
  // over (the templates table doesn't have room for them) — a template is
  // a quick starting point, not a full copy of a multi-day program.
  const saveAsTemplate = async () => {
    if (!user) return;
    if (!rows.length) { toast.error('Add at least one exercise first.'); return; }
    setSavingTemplate(true);
    try {
      await saveTemplate(user.id, {
        title: title.trim() || 'Untitled plan',
        exercises: rows.map((r, i) => ({
          name: r.name, muscle_group: null, default_sets: r.sets, default_reps: r.reps, default_weight: r.weight, order_index: i,
        })),
      });
      toast.success('Saved as a reusable template');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const submit = async () => {
    setBusy(true); setError('');
    // Flatten in day order (not raw insertion order) so order_index — and
    // therefore the prescribed order shown to the trainee — matches what's
    // actually rendered, grouped by day.
    const exercises: NewPlanExercise[] = days
      .flatMap((d) => rows.filter((r) => r.dayId === d.id).map((r) => ({ ...r, day: d.label })))
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight: r.weight, rest: r.rest, note: r.note, day: r.day || undefined }));
    const res = editingPlan
      ? await updatePlan(editingPlan.id, { title, exercises })
      : await assignPlan(traineeId, { title, exercises });
    setBusy(false);
    if (!res.ok) { setError(res.error || (editingPlan ? 'Could not save changes.' : 'Could not assign.')); return; }
    onAssigned();
    close();
  };

  const activeDay = days.find((d) => d.id === activeDayId);
  const showDayChrome = days.length > 1;
  const canSubmit = title.trim().length > 0 && rows.length > 0;

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
              <div className="min-w-0">
                <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">{editingPlan ? 'Edit plan' : 'Assign a plan'}</h2>
                <p className="text-[15px] text-[var(--text-secondary)] mt-1">For {traineeName}</p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <AppIcon name="Close" size="sm" />
              </button>
            </div>

            <div className="px-6 overflow-y-auto flex-1">
              <input
                placeholder="Plan name — e.g. Push Day"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(''); }}
                className="w-full h-13 py-3.5 rounded-2xl px-4 text-[17px] font-semibold outline-none mb-2"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />

              {/* Running summary — a coach can sanity-check the program size
                  before committing, without counting rows by eye. */}
              {rows.length > 0 && (
                <p className="text-[12px] font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                  {rows.length} exercise{rows.length !== 1 ? 's' : ''}{showDayChrome ? ` · ${days.length} days` : ''}
                </p>
              )}

              {rows.length === 0 && !showDayChrome ? (
                <p className="text-[14px] text-[var(--text-muted)] text-center py-6 leading-snug">
                  No exercises yet.<br />Tap <span className="text-[var(--text-secondary)] font-medium">Add exercise</span> to search the library.
                </p>
              ) : (
                <div className="space-y-4 mb-1">
                  {days.map((day) => {
                    const dayRows = rows.filter((r) => r.dayId === day.id);
                    const isActive = day.id === activeDayId;
                    return (
                      <div key={day.id}>
                        {showDayChrome && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setActiveDayId(day.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveDayId(day.id); }}
                            className="flex items-center gap-2 mb-2 pb-1.5"
                            style={{ borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}` }}
                          >
                            <input
                              value={day.label}
                              onChange={(e) => renameDay(day.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={() => setActiveDayId(day.id)}
                              placeholder="Day name"
                              className="flex-1 min-w-0 bg-transparent text-[15px] font-bold outline-none"
                              style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                            />
                            <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                              {dayRows.length} ex
                            </span>
                            {dayRows.length > 0 && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); duplicateDay(day.id); }} aria-label="Duplicate day"
                                title="Duplicate this day"
                                className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                <AppIcon name="Duplicate" size="sm" />
                              </button>
                            )}
                            {days.length > 1 && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeDay(day.id); }} aria-label="Remove day"
                                className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ color: '#ff8080' }}>
                                <AppIcon name="Trash" size="sm" />
                              </button>
                            )}
                          </div>
                        )}

                        {dayRows.length === 0 ? (
                          <p className="text-[13px] text-[var(--text-muted)] text-center py-4">No exercises in this day yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {dayRows.map((r) => {
                              const i = rows.indexOf(r);
                              const posInDay = dayRows.indexOf(r);
                              return (
                                <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--bg-elevated)' }}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="shrink-0 text-[12px] font-bold w-5 text-center text-[var(--text-muted)]">{posInDay + 1}</span>
                                    <p className="flex-1 text-[16px] font-semibold text-[var(--text-primary)] truncate">{r.name}</p>
                                    <button type="button" onClick={() => move(i, -1)} disabled={posInDay === 0} aria-label="Move up"
                                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-secondary)] disabled:opacity-25">
                                      <AppIcon name="ExpandDown" size="sm" /><span className="sr-only">up</span>
                                    </button>
                                    <button type="button" onClick={() => move(i, 1)} disabled={posInDay === dayRows.length - 1} aria-label="Move down"
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
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => setPicking(true)}
                className="w-full h-12 mt-3 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-1.5 text-[var(--text-secondary)]"
                style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}
              >
                <AppIcon name="Search" size="sm" /> Add exercise{showDayChrome && activeDay?.label ? ` to ${activeDay.label}` : ''}
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={addDay}
                  className="flex-1 h-11 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-1.5"
                  style={{ color: 'var(--accent)' }}
                >
                  <AppIcon name="Plus" size="sm" /> Add day
                </button>
                <button
                  type="button"
                  onClick={saveAsTemplate}
                  disabled={savingTemplate || rows.length === 0}
                  className="flex-1 h-11 rounded-2xl font-semibold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <AppIcon name="Duplicate" size="sm" /> Save as template
                </button>
              </div>

              {error && <p className="text-[14px] mt-2" style={{ color: '#ff8080' }}>{error}</p>}
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={submit}
                className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {busy ? <AppIcon name="Spinner" size="md" /> : editingPlan ? 'Save changes' : 'Assign plan'}
              </button>
            </div>
          </motion.div>

          {/* Searchable catalog — the exact picker the athlete uses */}
          {picking && (
            <div className="fixed inset-0 z-[80]" onClick={(e) => e.stopPropagation()}>
              <ExercisePicker
                recentExercises={recentExercises}
                defaultTab="recent"
                multiSelect
                contextLabel={showDayChrome ? `Adding to ${activeDay?.label || 'this day'}` : undefined}
                onSelect={(ex) => addExercise(ex.name, ex.defaultSets, ex.defaultReps)}
                onLoadTemplate={(exs) => { loadFromTemplate(exs); setPicking(false); }}
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
// SetRow, so building a program feels like logging a set. The number in the
// middle is a real input (not just a label) so a coach can type "225"
// directly instead of tapping + up to two dozen times to get there.
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
        <div className="flex items-baseline gap-1">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(clamp(n));
            }}
            onFocus={(e) => e.target.select()}
            className="font-victory tabular-nums text-[26px] leading-none font-black text-[var(--text-primary)] bg-transparent outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            style={{ width: `${Math.max(1.4, String(value).length)}ch` }}
          />
          {unit && <span className="text-[12px] font-semibold text-[var(--text-muted)]">{unit}</span>}
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
