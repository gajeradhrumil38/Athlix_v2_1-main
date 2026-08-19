import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { SHARE_SCOPES, type ScopeKey } from '../../lib/coachLinks';

// Bottom sheet where a trainee chooses exactly what a coach can see. Used both
// on Accept and when editing a live connection. Big labels, plain-language
// subtitles, one toggle per category — nothing to read twice.
interface Props {
  open: boolean;
  title: string;
  cta: string;
  initial?: Partial<Record<ScopeKey, boolean>>;
  busy?: boolean;
  onConfirm: (scopes: Partial<Record<ScopeKey, boolean>>) => void;
  onClose: () => void;
}

export const ShareScopeSheet: React.FC<Props> = ({ open, title, cta, initial, busy, onConfirm, onClose }) => {
  const [scopes, setScopes] = useState<Partial<Record<ScopeKey, boolean>>>(initial ?? {});

  // Reset local state whenever the sheet is (re)opened for a different link.
  React.useEffect(() => { if (open) setScopes(initial ?? {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyOn = SHARE_SCOPES.some((s) => scopes[s.key]);
  const toggle = (k: ScopeKey) => setScopes((p) => ({ ...p, [k]: !p[k] }));
  const setAll = (v: boolean) => setScopes(Object.fromEntries(SHARE_SCOPES.map((s) => [s.key, v])));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <motion.div
            className="w-full max-w-md rounded-t-3xl overflow-hidden"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 460, damping: 42 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="px-6 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-[22px] font-bold text-[var(--text-primary)]">{title}</h2>
              <button type="button" onClick={() => setAll(!anyOn)} className="text-[14px] font-semibold text-[var(--accent)]">
                {anyOn ? 'Clear all' : 'Share all'}
              </button>
            </div>
            <p className="px-6 pb-3 text-[15px] text-[var(--text-secondary)] leading-snug">
              Pick what your coach can see. You can change this any time.
            </p>

            <div className="max-h-[52vh] overflow-y-auto px-4 pb-2">
              {SHARE_SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className="w-full flex items-center justify-between gap-4 px-3 py-4 text-left rounded-2xl active:bg-[var(--bg-elevated)]"
                >
                  <div className="min-w-0">
                    <p className="text-[17px] font-semibold text-[var(--text-primary)]">{s.label}</p>
                    <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{s.hint}</p>
                  </div>
                  <span className={`toggle-track ${scopes[s.key] ? 'on' : ''}`} aria-hidden><span className="toggle-thumb" /></span>
                </button>
              ))}
            </div>

            <div className="px-6 pt-3 pb-6">
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(scopes)}
                className="w-full h-14 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {busy ? <AppIcon name="Spinner" size="md" /> : cta}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
