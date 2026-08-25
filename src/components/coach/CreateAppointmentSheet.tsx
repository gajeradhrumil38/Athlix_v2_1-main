import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday as dateFnsIsToday, parseISO,
} from 'date-fns';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { getSentLinks, type CoachLink } from '../../lib/coachLinks';
import { createAppointment } from '../../lib/appointments';
import { getAssignedPlansFor, type AssignedPlan } from '../../lib/assignedPlans';
import { DialPicker } from '../log/DialPicker';

// Trainer schedules a session with one of their trainees, from the
// trainer's own personal calendar. Picking the trainee is step one (this
// sheet owns the roster fetch); everything else — title, date/time,
// optionally a plan to attach, and notes on what the session covers — is a
// single flat form after that.
interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

export const CreateAppointmentSheet: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const [roster, setRoster] = useState<CoachLink[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [traineeId, setTraineeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);

  const reset = () => {
    setTraineeId(null); setTitle(''); setDate(''); setTime(''); setDurationMinutes('');
    setNotes(''); setPlans([]); setPlanId(null); setError(''); setBusy(false); setDurationPickerOpen(false);
  };
  const close = () => { onClose(); reset(); };

  useEffect(() => {
    if (!open) return;
    setRosterLoading(true);
    getSentLinks()
      .then((links) => setRoster(links.filter((l) => l.status === 'accepted' && l.trainee_id)))
      .finally(() => setRosterLoading(false));
    // Default to today, next half-hour — a reasonable starting point the
    // coach can adjust rather than a blank/invalid date.
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    const mins = now.getMinutes() < 30 ? 30 : 0;
    const hour = now.getMinutes() < 30 ? now.getHours() : now.getHours() + 1;
    setTime(`${String(hour % 24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
  }, [open]);

  // Load this trainee's active plans once picked, so the coach can attach
  // one — "which exercises should the trainee do" answered by pointing at
  // an existing prescription instead of re-describing it in free text.
  useEffect(() => {
    setPlanId(null);
    if (!traineeId) { setPlans([]); return; }
    setPlansLoading(true);
    getAssignedPlansFor(traineeId)
      .then(setPlans)
      .finally(() => setPlansLoading(false));
  }, [traineeId]);

  const selectedTrainee = roster.find((l) => l.trainee_id === traineeId);

  const submit = async () => {
    setError('');
    if (!traineeId) { setError('Pick a trainee.'); return; }
    if (!title.trim()) { setError('Give the appointment a title.'); return; }
    if (!date || !time) { setError('Pick a date and time.'); return; }
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    setBusy(true);
    const selectedPlan = plans.find((p) => p.id === planId);
    const res = await createAppointment(traineeId, selectedTrainee?.trainee_name ?? null, {
      title, notes: notes.trim() || undefined, scheduledAt,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      assignedPlanId: planId,
      assignedPlanTitle: selectedPlan?.title ?? null,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not create appointment.'); return; }
    toast.success('Appointment scheduled');
    onCreated();
    close();
  };

  return (
    <>
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
            <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">New appointment</h2>
                <p className="text-[15px] text-[var(--text-secondary)] mt-1">Schedule a session with a trainee</p>
              </div>
              <button type="button" onClick={close} aria-label="Close"
                className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                <AppIcon name="Close" size="sm" />
              </button>
            </div>

            <div className="px-6 overflow-y-auto flex-1 space-y-4">
              {/* Trainee picker */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Trainee</label>
                {rosterLoading ? (
                  <p className="text-[13px] text-[var(--text-muted)] py-2">Loading roster…</p>
                ) : roster.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)] py-2">No accepted trainees yet.</p>
                ) : (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                    {roster.map((l) => {
                      const active = l.trainee_id === traineeId;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setTraineeId(l.trainee_id)}
                          className="shrink-0 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all"
                          style={active
                            ? { background: 'rgba(200,255,0,0.12)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.35)' }
                            : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid transparent' }}
                        >
                          {l.trainee_name || 'Trainee'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <input
                placeholder="Title — e.g. Upper body session"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(''); }}
                className="w-full h-13 py-3.5 rounded-2xl px-4 text-[16px] font-semibold outline-none"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Date</label>
                  <InlineDatePicker value={date} onChange={setDate} />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Time</label>
                  <InlineTimePicker value={time} onChange={setTime} />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Duration (optional)</label>
                <button
                  type="button"
                  onClick={() => setDurationPickerOpen(true)}
                  className="w-full h-12 rounded-xl px-3 flex items-center gap-2 text-[14px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  <AppIcon name="History" size="sm" />
                  {durationMinutes ? `${durationMinutes} min` : 'No duration set'}
                </button>
              </div>

              {/* Attach a plan — tells the trainee exactly what to do, instead
                  of the coach re-describing it in the notes field. */}
              {traineeId && (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Attach a plan (optional)</label>
                  {plansLoading ? (
                    <p className="text-[13px] text-[var(--text-muted)] py-2">Loading plans…</p>
                  ) : plans.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-muted)] py-2">No plans assigned to this trainee yet.</p>
                  ) : (
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                      <button
                        type="button"
                        onClick={() => setPlanId(null)}
                        className="shrink-0 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all"
                        style={!planId
                          ? { background: 'rgba(200,255,0,0.12)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.35)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid transparent' }}
                      >
                        None
                      </button>
                      {plans.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPlanId(p.id === planId ? null : p.id)}
                          className="shrink-0 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all truncate max-w-[160px]"
                          style={p.id === planId
                            ? { background: 'rgba(200,255,0,0.12)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.35)' }
                            : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid transparent' }}
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Notes — what we'll do</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Form check on squat, then a light upper session"
                  rows={3}
                  className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none resize-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>

              {error && <p className="text-[14px]" style={{ color: '#ff8080' }}>{error}</p>}
              <div className="h-1" />
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {busy ? <AppIcon name="Spinner" size="md" /> : 'Schedule appointment'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {open && durationPickerOpen && (
      <DialPicker
        title="Duration"
        fieldKind="minutes"
        inputType="calories_time"
        initialValue={Number(durationMinutes) || 60}
        onClose={() => setDurationPickerOpen(false)}
        onConfirm={(v) => { setDurationMinutes(v ? String(v) : ''); setDurationPickerOpen(false); }}
      />
    )}
    </>
  );
};

// ── Custom date/time pickers ────────────────────────────────────────────
// Native <input type="date"/"time"> render as a plain, inconsistent browser
// widget that clashes with the rest of the app's dark theme. These are
// self-contained popovers matching the sheet's own visual language.

const usePopoverClose = (open: boolean, onClose: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return ref;
};

const InlineDatePicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : new Date();
  const [month, setMonth] = useState(selected);
  const ref = usePopoverClose(open, () => setOpen(false));

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  }), [month]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setMonth(selected); setOpen((v) => !v); }}
        className="w-full h-12 rounded-xl px-3 flex items-center gap-2 text-[14px] font-semibold"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      >
        <AppIcon name="Calendar" size="sm" />
        {value ? format(selected, 'MMM d, yyyy') : 'Pick a date'}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[75]"
            style={{ background: 'rgba(3,5,9,0.75)' }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute z-[76] mt-2 left-0 rounded-2xl p-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', width: 260 }}
          >
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setMonth((m) => subMonths(m, 1))} className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                <AppIcon name="Back" size="sm" />
              </button>
              <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{format(month, 'MMMM yyyy')}</p>
              <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="h-7 w-7 rounded-lg flex items-center justify-center rotate-180" style={{ color: 'var(--text-secondary)' }}>
                <AppIcon name="Back" size="sm" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={i} className="text-[10px] font-bold text-center py-1" style={{ color: 'var(--text-muted)' }}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const isSel = isSameDay(d, selected);
                const inMonth = isSameMonth(d, month);
                const isToday = dateFnsIsToday(d);
                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => { onChange(format(d, 'yyyy-MM-dd')); setOpen(false); }}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[12px] font-semibold"
                    style={{
                      background: isSel ? 'var(--accent)' : 'transparent',
                      color: isSel ? '#000' : !inMonth ? 'var(--text-muted)' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                      opacity: inMonth ? 1 : 0.4,
                      outline: isToday && !isSel ? '1px solid var(--accent)' : 'none',
                    }}
                  >
                    {format(d, 'd')}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));
const MINUTES = [0, 15, 30, 45];

const InlineTimePicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = usePopoverClose(open, () => setOpen(false));

  const [h24, m] = value ? value.split(':').map(Number) : [12, 0];
  const isPM = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const setParts = (nextH12: number, nextM: number, nextPM: boolean) => {
    let next24 = nextPM ? (nextH12 % 12) + 12 : nextH12 % 12;
    onChange(`${String(next24).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-12 rounded-xl px-3 flex items-center gap-2 text-[14px] font-semibold"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      >
        <AppIcon name="History" size="sm" />
        {value ? `${h12}:${String(m).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}` : 'Pick a time'}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[75]"
            style={{ background: 'rgba(3,5,9,0.75)' }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute z-[76] mt-2 right-0 rounded-2xl p-3 flex gap-2"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', width: 220 }}
          >
            <div className="flex-1 max-h-[160px] overflow-y-auto space-y-0.5">
              {HOURS_12.map((hh) => (
                <button
                  key={hh}
                  type="button"
                  onClick={() => setParts(hh, m, isPM)}
                  className="w-full h-8 rounded-lg text-[13px] font-semibold"
                  style={hh === h12 ? { background: 'var(--accent)', color: '#000' } : { color: 'var(--text-secondary)' }}
                >
                  {hh}
                </button>
              ))}
            </div>
            <div className="flex-1 max-h-[160px] overflow-y-auto space-y-0.5">
              {MINUTES.map((mm) => (
                <button
                  key={mm}
                  type="button"
                  onClick={() => setParts(h12, mm, isPM)}
                  className="w-full h-8 rounded-lg text-[13px] font-semibold"
                  style={mm === m ? { background: 'var(--accent)', color: '#000' } : { color: 'var(--text-secondary)' }}
                >
                  :{String(mm).padStart(2, '0')}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col gap-1">
              {(['AM', 'PM'] as const).map((ap) => (
                <button
                  key={ap}
                  type="button"
                  onClick={() => setParts(h12, m, ap === 'PM')}
                  className="flex-1 rounded-lg text-[12px] font-bold"
                  style={(ap === 'PM') === isPM ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  {ap}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
