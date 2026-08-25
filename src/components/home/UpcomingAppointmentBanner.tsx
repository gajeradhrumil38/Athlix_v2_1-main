import React, { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '../../config/icons';
import { getMyAppointments, type TrainerAppointment } from '../../lib/appointments';

// Trainee-side "meet in N minutes" heads-up, so a scheduled session doesn't
// require checking the calendar to notice. Lead time (how far ahead to
// start showing it) is a per-viewer preference, not synced data — stored in
// localStorage like the seen-plan/seen-appointment tracking elsewhere.
const LEAD_KEY = 'athlix:appt_reminder_lead_min';
const DEFAULT_LEAD = 10;
const LEAD_OPTIONS = [5, 10, 15, 30];

const readLead = (): number => {
  try {
    const v = Number(localStorage.getItem(LEAD_KEY));
    return LEAD_OPTIONS.includes(v) ? v : DEFAULT_LEAD;
  } catch { return DEFAULT_LEAD; }
};

// Frequent enough that "in N min" stays accurate without redundant network
// chatter — this is a countdown, not a live feed.
const CHECK_MS = 20_000;

export const UpcomingAppointmentBanner: React.FC = () => {
  const [appts, setAppts] = useState<TrainerAppointment[]>([]);
  const [leadMin, setLeadMin] = useState(readLead);
  const [editingLead, setEditingLead] = useState(false);
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    const all = await getMyAppointments();
    setAppts(all.filter((a) => a.status === 'scheduled'));
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => { load(); forceTick((t) => t + 1); }, CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const setLead = (min: number) => {
    setLeadMin(min);
    try { localStorage.setItem(LEAD_KEY, String(min)); } catch { /* ignore */ }
    setEditingLead(false);
  };

  const now = Date.now();
  const upcoming = appts
    .map((a) => ({ a, msAway: new Date(a.scheduled_at).getTime() - now }))
    // Keeps showing for a minute after start (in case the trainee's a beat
    // late opening the app), rolls off once clearly past.
    .filter(({ msAway }) => msAway > -60_000 && msAway <= leadMin * 60_000)
    .sort((x, y) => x.msAway - y.msAway)[0];

  if (!upcoming) return null;

  const minsAway = Math.max(0, Math.round(upcoming.msAway / 60_000));
  const withName = upcoming.a.trainer_name || 'your trainer';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'color-mix(in srgb, #4FC3F7 12%, var(--bg-elevated))', border: '1px solid color-mix(in srgb, #4FC3F7 35%, transparent)' }}>
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0" style={{ background: 'color-mix(in srgb, #4FC3F7 20%, transparent)', color: '#4FC3F7' }}>
          <AppIcon name="History" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {minsAway <= 0 ? `Meeting ${withName} now` : `Meet ${withName} in ${minsAway} min`}
          </p>
          <p className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{upcoming.a.title}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingLead((v) => !v)}
          aria-label="Edit reminder timing"
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          <AppIcon name="Edit" size="sm" />
        </button>
      </div>
      {editingLead && (
        <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide shrink-0" style={{ color: 'var(--text-muted)' }}>Remind me</span>
          {LEAD_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setLead(m)}
              className="px-2.5 py-1 rounded-full text-[12px] font-semibold"
              style={m === leadMin
                ? { background: '#4FC3F7', color: '#000' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {m} min before
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
