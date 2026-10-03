import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { getMyAppointments, formatApptTimeRange, type TrainerAppointment } from '../../lib/appointments';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// App-wide popup: when a trainer schedules, reschedules or cancels an
// appointment, this surfaces it live (Realtime push, same as
// AssignedPlanModal for a new plan) so the trainee doesn't have to go looking
// for it. "Seen" is tracked per VERSION of the appointment (id|time|status),
// so a reschedule or cancellation pops again even though the id was seen.
const SEEN_KEY = 'athlix:seen_appointments';
const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
};
const markSeen = (key: string) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), key])])); } catch { /* ignore */ }
};
const versionKey = (a: TrainerAppointment) => `${a.id}|${a.scheduled_at}|${a.status}`;

type Kind = 'new' | 'rescheduled' | 'cancelled';
type Pending = { appt: TrainerAppointment; kind: Kind };

// Only recent/upcoming rows matter for a popup — don't pull full history.
const lookbackRange = () => ({
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  endDate: '9999-12-31T00:00:00Z',
});

const POLL_MS = 30_000;

function pendingAppointmentPopups(all: TrainerAppointment[], seen: string[]): Pending[] {
  const now = Date.now();
  const out: Pending[] = [];
  for (const a of all) {
    const key = versionKey(a);
    if (seen.includes(key)) continue;
    // Legacy entries were the bare id — treat that as "seen this version".
    const legacySeen = seen.includes(a.id) && !seen.some((k) => k.startsWith(`${a.id}|`));
    if (legacySeen) continue;
    const knew = seen.includes(a.id) || seen.some((k) => k.startsWith(`${a.id}|`));
    const start = new Date(a.scheduled_at).getTime();
    if (a.status === 'scheduled') {
      // Already over — a "new appointment" popup for the past is noise.
      if (start < now - 60_000) continue;
      out.push({ appt: a, kind: knew ? 'rescheduled' : 'new' });
    } else if (a.status === 'cancelled' && knew) {
      out.push({ appt: a, kind: 'cancelled' });
    }
  }
  return out;
}

export const AppointmentModal: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appts, setAppts] = useState<Pending[]>([]);

  const load = useCallback(async () => {
    const all = await getMyAppointments(lookbackRange());
    setAppts(pendingAppointmentPopups(all, readSeen()));
  }, []);

  useEffect(() => {
    load();

    const channel = user
      ? supabase
          .channel(`trainer-appointments-${user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'trainer_appointments', filter: `trainee_id=eq.${user.id}` },
            () => load(),
          )
          .subscribe()
      : null;

    const interval = window.setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);

    return () => {
      if (channel) supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
    };
  }, [load, user]);

  const pending = appts[0];
  if (!pending) return null;
  const current = pending.appt;

  const dismiss = () => { markSeen(versionKey(current)); setAppts((p) => p.slice(1)); };
  const viewInCalendar = () => { dismiss(); navigate('/calendar'); };

  const when = new Date(current.scheduled_at);
  const who = current.trainer_name || 'your trainer';
  const heading = pending.kind === 'cancelled' ? `Cancelled by ${who}`
    : pending.kind === 'rescheduled' ? `Updated by ${who}`
    : `New appointment from ${who}`;
  const tone = pending.kind === 'cancelled' ? '#ff8080' : '#4FC3F7';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center px-5"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: '#05070b' }}
      >
        <motion.div
          className="w-full max-w-[400px] rounded-3xl overflow-hidden"
          initial={{ scale: 0.94, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="relative px-6 pt-7 pb-4 text-center">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3 right-3 h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-muted)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <AppIcon name="Close" size="sm" />
            </button>

            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
              style={{ background: tone, color: '#000' }}>
              <AppIcon name="History" size="xl" />
            </span>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {heading}
            </p>
            <h2 className="text-[23px] font-bold text-[var(--text-primary)] leading-tight mt-1.5"
              style={pending.kind === 'cancelled' ? { textDecoration: 'line-through' } : undefined}>{current.title}</h2>
            <p className="text-[15px] font-semibold mt-1.5" style={{ color: tone }}>
              {format(when, 'EEEE, MMM d')} · {formatApptTimeRange(when, current.duration_minutes)}
            </p>
            {current.notes && <p className="text-[14px] text-[var(--text-secondary)] mt-1.5 leading-snug">{current.notes}</p>}
          </div>

          {current.assigned_plan_title && (
            <div className="mx-5 px-4 py-3 rounded-2xl flex items-center gap-2.5" style={{ background: 'var(--bg-elevated)' }}>
              <AppIcon name="Clipboard" size="sm" />
              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{current.assigned_plan_title}</p>
            </div>
          )}

          <div className="px-5 pt-4 pb-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={viewInCalendar}
              className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <AppIcon name="Calendar" size="sm" /> View in calendar
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              Later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
