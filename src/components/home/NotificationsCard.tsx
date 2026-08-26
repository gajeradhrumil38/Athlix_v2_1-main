import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { getMyAssignedPlans, type AssignedPlan } from '../../lib/assignedPlans';
import { getMyAppointments, type TrainerAppointment } from '../../lib/appointments';

// Trainee-side notification history. The popups (AssignedPlanModal,
// AppointmentModal) surface a NEW plan/appointment once and then it's gone
// from view — there was nowhere to go back and see "what has my coach done
// recently" afterward. This card fills that gap: a compact, always-checkable
// feed of recent coach activity, reusing the same seen-tracking localStorage
// keys those popups already write to, so read state stays in sync with them
// rather than introducing a third, separate tracking mechanism.
const PLAN_SEEN_KEY = 'athlix:seen_plans';
const APPT_SEEN_KEY = 'athlix:seen_appointments';
const readSeen = (key: string): string[] => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
};
const markSeen = (key: string, id: string) => {
  try { localStorage.setItem(key, JSON.stringify([...new Set([...readSeen(key), id])])); } catch { /* ignore */ }
};

// Only recent items are notification-worthy — an assigned plan from 4
// months ago isn't "news" anymore, it's just part of the trainee's plan
// list (visible in My Coach already).
const MAX_AGE_DAYS = 30;
const MAX_ITEMS = 6;

type NotifItem = {
  id: string;
  kind: 'plan' | 'appointment-new' | 'appointment-cancelled' | 'appointment-completed';
  at: string;
  title: string;
  trainerName: string | null;
  read: boolean;
  onOpen: () => void;
};

export const NotificationsCard: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [appts, setAppts] = useState<TrainerAppointment[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getMyAssignedPlans(), getMyAppointments()])
      .then(([p, a]) => { setPlans(p); setAppts(a); })
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const seenPlans = readSeen(PLAN_SEEN_KEY);
  const seenAppts = readSeen(APPT_SEEN_KEY);

  const items: NotifItem[] = [];

  for (const p of plans) {
    if (new Date(p.created_at).getTime() < cutoff) continue;
    items.push({
      id: `plan-${p.id}`,
      kind: 'plan',
      at: p.created_at,
      title: p.title,
      trainerName: null,
      read: seenPlans.includes(p.id),
      onOpen: () => { markSeen(PLAN_SEEN_KEY, p.id); navigate('/my-coach'); },
    });
  }

  for (const a of appts) {
    if (new Date(a.created_at).getTime() < cutoff) continue;
    const kind = a.status === 'cancelled' ? 'appointment-cancelled' : a.status === 'completed' ? 'appointment-completed' : 'appointment-new';
    items.push({
      id: `appt-${a.id}`,
      kind,
      at: a.created_at,
      title: a.title,
      trainerName: a.trainer_name,
      read: seenAppts.includes(a.id),
      onOpen: () => { markSeen(APPT_SEEN_KEY, a.id); navigate('/calendar'); },
    });
  }

  items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  const shown = items.slice(0, MAX_ITEMS);
  // Counted from what's actually visible/clickable, not the full items
  // list — otherwise the badge could claim more unread than the card
  // shows, with no way to reach the rest and clear it.
  const unreadCount = shown.filter((i) => !i.read).length;

  if (shown.length === 0) return null;

  const iconFor = (kind: NotifItem['kind']): 'Clipboard' | 'History' => (kind === 'plan' ? 'Clipboard' : 'History');
  const colorFor = (kind: NotifItem['kind']) =>
    kind === 'appointment-cancelled' ? '#ff8080' : kind === 'appointment-completed' ? '#7cd992' : kind === 'appointment-new' ? '#4FC3F7' : 'var(--accent)';
  const labelFor = (item: NotifItem) => {
    const withName = item.trainerName || 'your trainer';
    switch (item.kind) {
      case 'plan': return `New plan from ${withName}`;
      case 'appointment-new': return `Appointment scheduled with ${withName}`;
      case 'appointment-cancelled': return `Cancelled by ${withName}`;
      case 'appointment-completed': return `Completed with ${withName}`;
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Notifications</p>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'var(--accent)', color: '#000' }}>
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onOpen}
            className="w-full text-left px-4 py-3 flex items-start gap-3"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5"
              style={{ background: `color-mix(in srgb, ${colorFor(item.kind)} 16%, transparent)`, color: colorFor(item.kind) }}>
              <AppIcon name={iconFor(item.kind)} size="sm" />
              {!item.read && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
              <p className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{labelFor(item)}</p>
            </div>
            <span className="text-[11px] shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {formatDistanceToNowStrict(new Date(item.at), { addSuffix: false })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
