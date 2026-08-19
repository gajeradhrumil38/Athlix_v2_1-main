import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../../config/icons';
import {
  getIncomingInvites, getMyCoaches, respondToInvite, updateShareScopes, disconnect,
  SHARE_SCOPES, type CoachLink, type ScopeKey,
} from '../../lib/coachLinks';
import { ShareScopeSheet } from './ShareScopeSheet';

// Trainee-side control center, shown in Settings: incoming coach invites to
// accept/decline, and connected coaches with per-category sharing + disconnect.
export const CoachesPanel: React.FC = () => {
  const [invites, setInvites] = useState<CoachLink[]>([]);
  const [coaches, setCoaches] = useState<CoachLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ link: CoachLink; mode: 'accept' | 'edit' } | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [inv, cch] = await Promise.all([getIncomingInvites(), getMyCoaches()]);
    setInvites(inv);
    setCoaches(cch);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const decline = async (link: CoachLink) => {
    setBusyId(link.id);
    await respondToInvite(link.id, false);
    await load();
    setBusyId(null);
  };

  const confirmSheet = async (scopes: Partial<Record<ScopeKey, boolean>>) => {
    if (!sheet) return;
    setBusyId(sheet.link.id);
    if (sheet.mode === 'accept') await respondToInvite(sheet.link.id, true, scopes);
    else await updateShareScopes(sheet.link.id, scopes);
    setSheet(null);
    await load();
    setBusyId(null);
  };

  const cut = async (link: CoachLink) => {
    setBusyId(link.id);
    await disconnect(link.id);
    await load();
    setBusyId(null);
  };

  if (loading) {
    return (
      <section className="glass-card overflow-hidden">
        <PanelHeader />
        <div className="px-5 py-6 flex items-center gap-2 text-[var(--text-muted)]">
          <AppIcon name="Spinner" size="sm" /> <span className="text-[14px]">Loading…</span>
        </div>
      </section>
    );
  }

  const nothing = invites.length === 0 && coaches.length === 0;

  return (
    <section className="glass-card overflow-hidden">
      <PanelHeader />

      {nothing && (
        <div className="px-5 py-7 text-center">
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">No coach yet</p>
          <p className="text-[14px] text-[var(--text-muted)] mt-1 leading-snug">
            When a coach invites you by email, it'll show up here to accept.
          </p>
        </div>
      )}

      {/* Incoming invites — the loud, primary action */}
      {invites.map((link) => (
        <div key={link.id} className="px-5 py-5 border-t border-[var(--border)] first:border-t-0">
          <p className="text-[19px] font-bold text-[var(--text-primary)] leading-tight">
            {link.trainer_name || 'A coach'} wants to coach you
          </p>
          <p className="text-[14px] text-[var(--text-muted)] mt-1">Invited {link.invited_email}</p>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => setSheet({ link, mode: 'accept' })}
              className="flex-1 h-12 rounded-2xl font-bold text-[16px]"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busyId === link.id}
              onClick={() => decline(link)}
              className="flex-1 h-12 rounded-2xl font-semibold text-[16px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* Quick jump to assigned plans once connected */}
      {coaches.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/my-coach')}
          className="w-full flex items-center gap-3 px-5 py-3.5 border-t border-[var(--border)] text-left active:bg-[var(--bg-elevated)]"
        >
          <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', color: '#000' }}>
            <AppIcon name="Clipboard" size="sm" />
          </span>
          <span className="flex-1 text-[15px] font-semibold text-[var(--text-primary)]">View assigned plans</span>
          <AppIcon name="Forward" size="md" />
        </button>
      )}

      {/* Connected coaches */}
      {coaches.map((link) => {
        const on = SHARE_SCOPES.filter((s) => link.shared_scopes?.[s.key]).map((s) => s.label);
        return (
          <div key={link.id} className="px-5 py-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-[var(--text-primary)] truncate">
                  {link.trainer_name || 'Your coach'}
                </p>
                <p className="text-[13px] text-[var(--text-muted)] mt-0.5 truncate">
                  {on.length ? `Sharing: ${on.join(', ')}` : 'Not sharing anything yet'}
                </p>
              </div>
              <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                <AppIcon name="Coach" size="sm" />
              </span>
            </div>
            <div className="flex gap-3 mt-3">
              <button
                type="button"
                onClick={() => setSheet({ link, mode: 'edit' })}
                className="flex-1 h-11 rounded-xl font-semibold text-[15px] text-[var(--text-primary)]"
                style={{ background: 'var(--bg-elevated)' }}
              >
                Edit sharing
              </button>
              <button
                type="button"
                disabled={busyId === link.id}
                onClick={() => cut(link)}
                className="px-4 h-11 rounded-xl font-semibold text-[15px]"
                style={{ background: 'var(--bg-elevated)', color: '#ff8080' }}
              >
                Disconnect
              </button>
            </div>
          </div>
        );
      })}

      <ShareScopeSheet
        open={!!sheet}
        title={sheet?.mode === 'accept' ? 'What to share' : 'Edit sharing'}
        cta={sheet?.mode === 'accept' ? 'Accept & share' : 'Save'}
        initial={sheet?.link.shared_scopes}
        busy={!!sheet && busyId === sheet.link.id}
        onConfirm={confirmSheet}
        onClose={() => setSheet(null)}
      />
    </section>
  );
};

const PanelHeader: React.FC = () => (
  <div className="px-5 py-3 border-b border-[var(--border)]">
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
      Coaches
    </h3>
  </div>
);
