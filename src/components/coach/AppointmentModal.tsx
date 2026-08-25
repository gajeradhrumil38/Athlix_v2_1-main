import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { getMyAppointments, type TrainerAppointment } from '../../lib/appointments';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// App-wide popup: when a trainer schedules an appointment, this surfaces it
// live (Realtime push, same as AssignedPlanModal for a new plan) so the
// trainee doesn't have to go looking for it. Shows once per appointment
// (persisted), then it lives on in the trainee's own calendar.
const SEEN_KEY = 'athlix:seen_appointments';
const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
};
const markSeen = (id: string) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), id])])); } catch { /* ignore */ }
};

const POLL_MS = 30_000;

export const AppointmentModal: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appts, setAppts] = useState<TrainerAppointment[]>([]);

  const load = useCallback(async () => {
    const all = await getMyAppointments();
    const seen = readSeen();
    setAppts(all.filter((a) => a.status === 'scheduled' && !seen.includes(a.id)));
  }, []);

  useEffect(() => {
    load();

    const channel = user
      ? supabase
          .channel(`trainer-appointments-${user.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'trainer_appointments', filter: `trainee_id=eq.${user.id}` },
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

  const current = appts[0];
  if (!current) return null;

  const dismiss = () => { markSeen(current.id); setAppts((p) => p.slice(1)); };
  const viewInCalendar = () => { markSeen(current.id); setAppts((p) => p.slice(1)); navigate('/calendar'); };

  const when = new Date(current.scheduled_at);

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
              style={{ background: '#4FC3F7', color: '#000' }}>
              <AppIcon name="History" size="xl" />
            </span>
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              New appointment from {current.trainer_name || 'your trainer'}
            </p>
            <h2 className="text-[23px] font-bold text-[var(--text-primary)] leading-tight mt-1.5">{current.title}</h2>
            <p className="text-[15px] font-semibold mt-1.5" style={{ color: '#4FC3F7' }}>
              {format(when, 'EEEE, MMM d')} · {format(when, 'h:mm a')}
              {current.duration_minutes ? ` · ${current.duration_minutes} min` : ''}
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
