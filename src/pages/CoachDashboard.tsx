import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { AppIcon } from '../config/icons';
import { getSentLinks, cancelInvite, SHARE_SCOPES, type CoachLink } from '../lib/coachLinks';
import { getRosterStatus, getTraineeDashboard, type RosterStatus } from '../lib/coachData';
import { getMyCreatedAppointments, type TrainerAppointment } from '../lib/appointments';
import { getAssignedPlansFor } from '../lib/assignedPlans';
import { computeSignals } from '../lib/traineeSignals';
import { dayRange, rankNeedsYou, weekStrip, type NeedsYou } from '../lib/coachToday';
import { getMyPackages, packageSignals, packageUsage } from '../lib/packages';
import { updateAppointment } from '../lib/appointments';
import { format } from 'date-fns';
import { InviteTraineeSheet } from '../components/coach/InviteTraineeSheet';
import { confirmDialog } from '../components/shared/ConfirmDialog';

// Trainer's home, built around today: the sessions booked today (one tap to
// start), who needs attention (ranked from the same signals the trainee page
// and Ask AI use), then the whole roster. Guarded by profiles.is_trainer.
export const CoachDashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [status, setStatus] = useState<Record<string, RosterStatus>>({});
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(false);
  const [today, setToday] = useState<TrainerAppointment[] | null>(null);
  const [needs, setNeeds] = useState<NeedsYou[] | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const l = await getSentLinks();
    setLinks(l);
    setLoading(false);
    const accepted = l.filter((x) => x.status === 'accepted' && x.trainee_id);
    const traineeIds = accepted.map((x) => x.trainee_id as string);
    getMyCreatedAppointments(dayRange())
      .then((a) => setToday(a.filter((x) => x.status !== 'cancelled').sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))))
      .catch(() => setToday([]));
    // Packages are counted from appointments, so fetch both once for everyone.
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const pkgData = Promise.all([getMyPackages(), getMyCreatedAppointments({ startDate: since, endDate: new Date().toISOString() })]).catch(() => [[], []] as const);
    setStatus(await getRosterStatus(traineeIds));
    // Signals need each trainee's data; three at a time keeps it gentle, and
    // it warms the cache so opening a trainee afterwards is instant.
    const items: { traineeId: string; name: string; signals: ReturnType<typeof computeSignals> }[] = [];
    const queue = [...accepted];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let link = queue.shift(); link; link = queue.shift()) {
        const tid = link.trainee_id as string;
        try {
          const [dash, plans] = await Promise.all([getTraineeDashboard(tid), getAssignedPlansFor(tid)]);
          const [pkgs, appts] = await pkgData;
          const pkgSignals = packageSignals(packageUsage(pkgs.filter((p) => p.trainee_id === tid), appts));
          if (dash) items.push({ traineeId: tid, name: link.trainee_name || dash.name || link.invited_email, signals: [...pkgSignals, ...computeSignals(dash, plans)] });
        } catch { /* one trainee failing shouldn't hide the rest */ }
      }
    }));
    setNeeds(rankNeedsYou(items));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Only trainers see this page.
  if (profile && !profile.is_trainer) return <Navigate to="/" replace />;

  const trainees = links.filter((l) => l.status === 'accepted');
  const pending = links.filter((l) => l.status === 'pending');
  const needById = new Map((needs ?? []).map((n) => [n.traineeId, n]));
  const rank = (l: CoachLink) => { const n = l.trainee_id ? needById.get(l.trainee_id) : undefined; return n ? (n.level === 'high' ? 0 : 1) : 2; };
  const q = query.trim().toLowerCase();
  const roster = trainees
    .filter((l) => !q || (l.trainee_name || l.invited_email || '').toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || (a.trainee_name || '').localeCompare(b.trainee_name || ''));
  const open = (traineeId: string, startLog = false) => navigate(`/coach/trainee/${traineeId}`, startLog ? { state: { openLog: true } } : undefined);
  const nowMs = Date.now();
  const nextId = today?.find((a) => a.status === 'scheduled' && new Date(a.scheduled_at).getTime() + (a.duration_minutes || 60) * 60_000 > nowMs)?.id;
  const markAppt = async (a: TrainerAppointment, status: 'completed' | 'no_show') => {
    const res = await updateAppointment(a.id, { status });
    if (!res.ok) { toast.error(res.error || 'Could not update.'); return; }
    setToday((t) => t?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? t);
    toast.success(status === 'completed' ? 'Marked attended' : 'Marked no-show');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 pt-2 pb-5">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold text-[var(--text-primary)] leading-none">Today</h1>
          <p className="text-[15px] text-[var(--text-muted)] mt-1.5 truncate">
            {format(new Date(), 'EEE, MMM d')} · {trainees.length} trainee{trainees.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/me')} aria-label="My training" title="My training"
            className="h-11 w-11 rounded-2xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            style={{ background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)' }}>
            <AppIcon name="Home" size="md" />
          </button>
          <button type="button" onClick={() => setInvite(true)}
            className="flex items-center gap-1.5 h-11 px-4 rounded-2xl font-bold text-[15px]"
            style={{ background: 'var(--accent)', color: '#000' }}>
            <AppIcon name="InvitePerson" size="sm" /> Invite
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-10 justify-center">
          <AppIcon name="Spinner" size="sm" /> <span>Loading…</span>
        </div>
      ) : trainees.length === 0 && pending.length === 0 ? (
        <EmptyState onInvite={() => setInvite(true)} />
      ) : (
        <div className="space-y-6">
          {/* Today's sessions */}
          <section>
            <SectionTitle title="Sessions today" right={<button type="button" onClick={() => navigate('/calendar')} className="text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Calendar</button>} />
            {today == null ? <SkeletonRows n={1} /> : today.length === 0 ? (
              <p className="glass-card px-5 py-4 text-[14px] text-[var(--text-muted)]">
                Nothing booked today. <button type="button" onClick={() => navigate('/calendar')} className="font-semibold text-[var(--text-secondary)] underline">Book a session</button>
              </p>
            ) : (
              <div className="space-y-2">
                {today.map((a) => {
                  const start = new Date(a.scheduled_at);
                  const ended = start.getTime() + (a.duration_minutes || 60) * 60_000 <= nowMs;
                  const done = a.status !== 'scheduled';
                  const isNext = a.id === nextId;
                  return (
                    <div key={a.id} className="glass-card px-4 py-3 flex items-center gap-3" style={{ opacity: done ? 0.6 : 1 }}>
                      <div className="w-[58px] shrink-0 text-center">
                        <p className="text-[16px] font-bold tabular-nums" style={{ color: isNext ? 'var(--accent)' : 'var(--text-primary)' }}>{format(start, 'h:mm')}</p>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">{format(start, 'a')}{a.duration_minutes ? ` · ${a.duration_minutes}m` : ''}</p>
                      </div>
                      <button type="button" onClick={() => open(a.trainee_id)} className="min-w-0 flex-1 text-left">
                        <p className="text-[16px] font-semibold text-[var(--text-primary)] truncate">{a.trainee_name || 'Trainee'}</p>
                        <p className="text-[13px] text-[var(--text-muted)] truncate">{a.title}{a.assigned_plan_title ? ` · ${a.assigned_plan_title}` : ''}</p>
                      </button>
                      {a.status === 'completed' && <span className="shrink-0 text-[12px] font-bold" style={{ color: 'var(--green)' }}>✓ Attended</span>}
                      {a.status === 'no_show' && <span className="shrink-0 text-[12px] font-bold" style={{ color: 'var(--yellow)' }}>No-show</span>}
                      {/* Over but not marked: one tap each — this is what counts the session. */}
                      {!done && ended && (
                        <div className="shrink-0 flex gap-1.5">
                          <button type="button" onClick={() => markAppt(a, 'completed')} aria-label="Attended" className="h-9 px-3 rounded-xl text-[13px] font-bold" style={{ background: 'color-mix(in srgb, var(--green) 16%, transparent)', color: 'var(--green)' }}><span className="sm:hidden">✓</span><span className="hidden sm:inline">Attended</span></button>
                          <button type="button" onClick={() => markAppt(a, 'no_show')} className="h-9 px-2.5 rounded-xl text-[13px] font-bold" style={{ background: 'color-mix(in srgb, var(--yellow) 12%, transparent)', color: 'var(--yellow)' }}>No-show</button>
                        </div>
                      )}
                      {!done && !ended && (
                        <button type="button" onClick={() => open(a.trainee_id, true)}
                          className="shrink-0 h-10 px-4 rounded-xl text-[14px] font-bold"
                          style={isNext ? { background: 'var(--accent)', color: '#000' } : { background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)', color: 'var(--text-primary)' }}>
                          Start
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Needs you */}
          {trainees.length > 0 && (
            <section>
              <SectionTitle title="Needs you" />
              {needs == null ? <SkeletonRows n={2} /> : needs.length === 0 ? (
                <p className="glass-card px-5 py-4 text-[14px] text-[var(--text-muted)]">Everyone's on track. ✓</p>
              ) : (
                <div className="glass-card overflow-hidden">
                  {needs.slice(0, 6).map((n, i) => (
                    <button key={n.traineeId} type="button" onClick={() => open(n.traineeId)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/[0.02]"
                      style={i ? { borderTop: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)' } : undefined}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: n.level === 'high' ? 'var(--red)' : 'var(--yellow)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{n.name}</p>
                        <p className="text-[13px] text-[var(--text-secondary)] truncate">
                          {n.reasons.join(' · ')}{n.wins.length ? <span style={{ color: 'var(--green)' }}> · {n.wins[0]}</span> : null}
                        </p>
                      </div>
                      <AppIcon name="Forward" size="sm" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Everyone */}
          <section>
            <SectionTitle title="All trainees" right={trainees.length > 5 ? (
              <label className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[var(--text-muted)]" style={{ background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)' }}>
                <AppIcon name="Search" size="sm" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search trainees"
                  className="w-24 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]" style={{ border: 'none' }} />
              </label>
            ) : undefined} />
            <div className="space-y-2">
              {roster.map((l) => (
                <TraineeCard key={l.id} link={l} status={l.trainee_id ? status[l.trainee_id] : undefined}
                  need={l.trainee_id ? needById.get(l.trainee_id) : undefined} onOpen={() => open(l.trainee_id as string)} />
              ))}
              {q && roster.length === 0 && <p className="text-[14px] text-[var(--text-muted)] px-1">No trainee matches "{query}".</p>}
              {pending.map((l) => (
                <PendingCard
                  key={l.id}
                  link={l}
                  onCancel={async () => {
                    if (!(await confirmDialog({ title: 'Cancel this invite?', message: `${l.invited_email} won't be able to join with it.`, confirmLabel: 'Cancel invite', cancelLabel: 'Keep', danger: true }))) return;
                    const res = await cancelInvite(l.id);
                    if (!res.ok) { toast.error(res.error || 'Could not cancel invite.'); return; }
                    toast.success('Invite cancelled');
                    load();
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <InviteTraineeSheet open={invite} onClose={() => setInvite(false)} onSent={load} />
    </div>
  );
};

const SectionTitle: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div className="flex items-center justify-between gap-2 mb-2 px-1">
    <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">{title}</h2>
    {right}
  </div>
);

const SkeletonRows: React.FC<{ n: number }> = ({ n }) => (
  <div className="space-y-2" aria-label="Loading">
    {Array.from({ length: n }, (_, i) => <div key={i} className="glass-card h-[60px] animate-pulse" />)}
  </div>
);

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const TraineeCard: React.FC<{ link: CoachLink; status?: RosterStatus; need?: NeedsYou; onOpen: () => void }> = ({ link, status, need, onOpen }) => {
  const shared = SHARE_SCOPES.filter((s) => link.shared_scopes?.[s.key]).length;
  const d = status?.daysAgo;
  const lastLabel = d == null ? null : d === 0 ? 'Trained today' : d === 1 ? 'Trained 1d ago' : `Trained ${d}d ago`;
  const strip = status ? weekStrip(status.weekDates) : null;
  const flag = need ? (need.level === 'high' ? 'var(--red)' : 'var(--yellow)') : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full glass-card px-4 py-3.5 flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform"
    >
      <span className="relative shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl text-[19px] font-bold"
        style={{ background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)', color: 'var(--accent)' }}>
        {(link.trainee_name || link.invited_email || '?').charAt(0).toUpperCase()}
        {flag && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2" style={{ background: flag, borderColor: 'var(--bg-base)' }} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold text-[var(--text-primary)] truncate">{link.trainee_name || link.invited_email}</p>
        <p className="text-[13px] mt-0.5 truncate" style={{ color: flag ?? 'var(--text-muted)' }}>
          {need ? need.reasons[0]
            : lastLabel ? <>{lastLabel}{status?.weekSessions ? <span className="hidden sm:inline"> · {status.weekSessions} this week</span> : null}</>
            : shared ? `Sharing ${shared} categor${shared === 1 ? 'y' : 'ies'}` : 'Not sharing yet'}
        </p>
      </div>
      {/* Last 7 days at a glance — a filled dot per day trained. */}
      {strip && (
        <div className="flex shrink-0 items-end gap-1" aria-label={`${status?.weekSessions ?? 0} sessions in the last 7 days`}>
          {strip.map((on, i) => {
            const day = new Date(); day.setDate(day.getDate() - (6 - i));
            return (
              <span key={i} className="flex flex-col items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: on ? 'var(--green)' : 'color-mix(in srgb, var(--text-primary) 12%, transparent)' }} />
                <span className="text-[9px] font-semibold text-[var(--text-muted)]">{DAY_LETTERS[day.getDay()]}</span>
              </span>
            );
          })}
        </div>
      )}
      <AppIcon name="Forward" size="md" />
    </button>
  );
};

const PendingCard: React.FC<{ link: CoachLink; onCancel: () => void }> = ({ link, onCancel }) => (
  <div className="glass-card px-5 py-4 flex items-center gap-4">
    <span className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--text-muted)]"
      style={{ background: 'var(--bg-elevated)' }}>
      <AppIcon name="Mail" size="md" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[16px] font-medium text-[var(--text-primary)] truncate">{link.invited_email}</p>
      <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Invite sent — waiting to accept</p>
    </div>
    <span className="hidden sm:inline-block text-[12px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Pending</span>
    <button type="button" onClick={onCancel} aria-label={`Cancel invite to ${link.invited_email}`}
      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: '#ff8080' }}>
      <AppIcon name="Close" size="sm" />
    </button>
  </div>
);

const EmptyState: React.FC<{ onInvite: () => void }> = ({ onInvite }) => (
  <div className="glass-card px-6 py-12 flex flex-col items-center text-center">
    <span className="flex h-16 w-16 items-center justify-center rounded-3xl mb-4"
      style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
      <AppIcon name="Coach" size="xl" />
    </span>
    <p className="text-[20px] font-bold text-[var(--text-primary)]">No trainees yet</p>
    <p className="text-[15px] text-[var(--text-muted)] mt-1.5 max-w-[280px] leading-snug">
      Invite someone by email. Once they accept, their training shows up here.
    </p>
    <button
      type="button"
      onClick={onInvite}
      className="mt-5 h-12 px-6 rounded-2xl font-bold text-[16px]"
      style={{ background: 'var(--accent)', color: '#000' }}
    >
      Invite your first trainee
    </button>
  </div>
);
