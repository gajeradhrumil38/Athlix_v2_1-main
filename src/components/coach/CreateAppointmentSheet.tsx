import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { getSentLinks, type CoachLink } from '../../lib/coachLinks';
import { createAppointment } from '../../lib/appointments';

// Trainer schedules a session with one of their trainees, from the
// trainer's own personal calendar. Picking the trainee is step one (this
// sheet owns the roster fetch); everything else — title, date/time, notes
// on what the session covers — is a single flat form after that.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setTraineeId(null); setTitle(''); setDate(''); setTime(''); setDurationMinutes(''); setNotes(''); setError(''); setBusy(false);
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

  const selectedTrainee = roster.find((l) => l.trainee_id === traineeId);

  const submit = async () => {
    setError('');
    if (!traineeId) { setError('Pick a trainee.'); return; }
    if (!title.trim()) { setError('Give the appointment a title.'); return; }
    if (!date || !time) { setError('Pick a date and time.'); return; }
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    setBusy(true);
    const res = await createAppointment(traineeId, selectedTrainee?.trainee_name ?? null, {
      title, notes: notes.trim() || undefined, scheduledAt,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not create appointment.'); return; }
    toast.success('Appointment scheduled');
    onCreated();
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
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-12 rounded-xl px-3 text-[14px] font-semibold outline-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full h-12 rounded-xl px-3 text-[14px] font-semibold outline-none"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mb-1.5 block">Duration (minutes, optional)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="60"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full h-12 rounded-xl px-3 text-[14px] font-semibold outline-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
              </div>

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
  );
};
