import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AppIcon } from '../config/icons';
import { getSentLinks, SHARE_SCOPES, type CoachLink } from '../lib/coachLinks';
import { InviteTraineeSheet } from '../components/coach/InviteTraineeSheet';

// Trainer's home: the roster of accepted trainees + pending invites, and the
// one-tap invite. Guarded by profiles.is_trainer.
export const CoachDashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<CoachLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(false);

  const load = useCallback(async () => {
    setLinks(await getSentLinks());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Only trainers see this page.
  if (profile && !profile.is_trainer) return <Navigate to="/" replace />;

  const trainees = links.filter((l) => l.status === 'accepted');
  const pending = links.filter((l) => l.status === 'pending');

  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      {/* Header */}
      <div className="flex items-end justify-between pt-2 pb-5">
        <div>
          <h1 className="text-[30px] font-bold text-[var(--text-primary)] leading-none">Your trainees</h1>
          <p className="text-[15px] text-[var(--text-muted)] mt-1.5">
            {trainees.length} active{pending.length ? ` · ${pending.length} pending` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInvite(true)}
          className="flex items-center gap-1.5 h-11 px-4 rounded-2xl font-bold text-[15px]"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          <AppIcon name="InvitePerson" size="sm" /> Invite
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-10 justify-center">
          <AppIcon name="Spinner" size="sm" /> <span>Loading…</span>
        </div>
      ) : trainees.length === 0 && pending.length === 0 ? (
        <EmptyState onInvite={() => setInvite(true)} />
      ) : (
        <div className="space-y-3">
          {trainees.map((l) => (
            <TraineeCard key={l.id} link={l} onOpen={() => navigate(`/coach/trainee/${l.trainee_id}`)} />
          ))}
          {pending.map((l) => <PendingCard key={l.id} link={l} />)}
        </div>
      )}

      <InviteTraineeSheet open={invite} onClose={() => setInvite(false)} onSent={load} />
    </div>
  );
};

const TraineeCard: React.FC<{ link: CoachLink; onOpen: () => void }> = ({ link, onOpen }) => {
  const shared = SHARE_SCOPES.filter((s) => link.shared_scopes?.[s.key]).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full glass-card px-5 py-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
    >
      <span className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl text-[19px] font-bold"
        style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
        {(link.trainee_name || link.invited_email || '?').charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[18px] font-semibold text-[var(--text-primary)] truncate">
          {link.trainee_name || link.invited_email}
        </p>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
          {shared ? `Sharing ${shared} categor${shared === 1 ? 'y' : 'ies'}` : 'Not sharing yet'}
        </p>
      </div>
      <AppIcon name="Forward" size="md" />
    </button>
  );
};

const PendingCard: React.FC<{ link: CoachLink }> = ({ link }) => (
  <div className="glass-card px-5 py-4 flex items-center gap-4 opacity-80">
    <span className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--text-muted)]"
      style={{ background: 'var(--bg-elevated)' }}>
      <AppIcon name="Mail" size="md" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[16px] font-medium text-[var(--text-primary)] truncate">{link.invited_email}</p>
      <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Invite sent — waiting to accept</p>
    </div>
    <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Pending</span>
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
