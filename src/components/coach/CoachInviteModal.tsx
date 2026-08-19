import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { getIncomingInvites, respondToInvite, type CoachLink, type ScopeKey } from '../../lib/coachLinks';
import { ShareScopeSheet } from './ShareScopeSheet';

// App-wide popup: as soon as a registered user has a pending coach invite, this
// surfaces "You have an invitation from Coach <name>" with Accept / Decline /
// Close — instead of them having to dig into Settings. Mounted once in Layout.
// Closing dismisses for the session (still actionable later in Settings).

const DISMISS_KEY = 'athlix:dismissed_invites';
const readDismissed = (): string[] => {
  try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; }
};
const addDismissed = (id: string) => {
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...new Set([...readDismissed(), id])])); } catch { /* ignore */ }
};

export const CoachInviteModal: React.FC = () => {
  const [invites, setInvites] = useState<CoachLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [scopeSheet, setScopeSheet] = useState(false);

  const load = useCallback(async () => {
    const all = await getIncomingInvites();
    const dismissed = readDismissed();
    setInvites(all.filter((i) => !dismissed.includes(i.id)));
  }, []);

  useEffect(() => {
    load();
    // Refresh when a fresh invite might have arrived (e.g. after login or when
    // Settings tells us to). Cheap: just re-reads the user's own pending rows.
    const handler = () => load();
    window.addEventListener('athlix:refresh-invites', handler);
    return () => window.removeEventListener('athlix:refresh-invites', handler);
  }, [load]);

  const current = invites[0];
  if (!current) return null;

  const dismiss = () => { addDismissed(current.id); setInvites((p) => p.slice(1)); };

  const decline = async () => {
    setBusy(true);
    await respondToInvite(current.id, false);
    setBusy(false);
    setInvites((p) => p.slice(1));
  };

  const accept = async (scopes: Partial<Record<ScopeKey, boolean>>) => {
    setBusy(true);
    await respondToInvite(current.id, true, scopes);
    setBusy(false);
    setScopeSheet(false);
    setInvites((p) => p.slice(1));
    window.dispatchEvent(new CustomEvent('athlix:coaches-changed'));
  };

  return (
    <>
      <AnimatePresence>
        {!scopeSheet && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center px-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(0,0,0,0.66)' }}
          >
            <motion.div
              className="w-full max-w-[380px] rounded-3xl overflow-hidden"
              initial={{ scale: 0.94, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <div className="relative px-6 pt-7 pb-5 text-center">
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
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  <AppIcon name="Coach" size="xl" />
                </span>
                <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Coaching invite</p>
                <h2 className="text-[23px] font-bold text-[var(--text-primary)] leading-tight mt-1.5">
                  {current.trainer_name || 'A coach'} wants to coach you
                </h2>
                <p className="text-[14px] text-[var(--text-secondary)] mt-2 leading-snug">
                  Accept to share your training — you choose exactly what they can see, and can disconnect any time.
                </p>
              </div>

              <div className="px-5 pb-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setScopeSheet(true)}
                  className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  Accept
                </button>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={decline}
                    className="flex-1 h-12 rounded-2xl font-semibold text-[15px] disabled:opacity-50"
                    style={{ background: 'var(--bg-elevated)', color: '#ff8080' }}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={dismiss}
                    className="flex-1 h-12 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)] disabled:opacity-50"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    Later
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareScopeSheet
        open={scopeSheet}
        title="What to share"
        cta="Accept & share"
        busy={busy}
        onConfirm={accept}
        onClose={() => setScopeSheet(false)}
      />
    </>
  );
};
