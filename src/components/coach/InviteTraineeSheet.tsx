import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { inviteTrainee } from '../../lib/coachLinks';

// Dead-simple invite: one email field, one Send. Exactly the flow the user
// asked for — trainer types an email, trainee sees it in their Settings.
interface Props {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export const InviteTraineeSheet: React.FC<Props> = ({ open, onClose, onSent }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = () => { setEmail(''); setError(''); setDone(false); setBusy(false); };

  const send = async () => {
    setBusy(true);
    setError('');
    const res = await inviteTrainee(email);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not send.'); return; }
    setDone(true);
    onSent();
    setTimeout(() => { onClose(); reset(); }, 1100);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { onClose(); reset(); }}
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl overflow-hidden"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 460, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">Invite a trainee</h2>
              <p className="text-[15px] text-[var(--text-secondary)] mt-1 leading-snug">
                Enter their email. They'll get an invite in their app to accept.
              </p>
            </div>

            {done ? (
              <div className="px-6 py-8 flex flex-col items-center gap-2">
                <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--accent)', color: '#000' }}>
                  <AppIcon name="Check" size="lg" />
                </span>
                <p className="text-[17px] font-semibold text-[var(--text-primary)] mt-1">Invite sent</p>
              </div>
            ) : (
              <div className="px-6 pt-3 pb-6">
                <input
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="trainee@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && email) send(); }}
                  className="w-full h-14 rounded-2xl px-4 text-[17px] outline-none"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: `1px solid ${error ? '#ff8080' : 'var(--border)'}` }}
                  autoFocus
                />
                {error && <p className="text-[14px] mt-2" style={{ color: '#ff8080' }}>{error}</p>}
                <button
                  type="button"
                  disabled={!email || busy}
                  onClick={send}
                  className="w-full h-14 mt-4 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  {busy ? <AppIcon name="Spinner" size="md" /> : 'Send invite'}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
