import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { haptics } from '../../lib/haptics';

// The app's own confirm dialog, replacing window.confirm (which shows the
// browser's "<site> says" box). `await confirmDialog({...})` resolves true on
// confirm, false on cancel / backdrop / Escape. <ConfirmHost /> is mounted once
// at the app root.

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Destructive actions get a red confirm button.
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;
const queue: Pending[] = [];

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const p = { ...opts, resolve };
    if (show) show(p);
    else queue.push(p);
  });
}

export const ConfirmHost: React.FC = () => {
  const [current, setCurrent] = useState<Pending | null>(null);
  const waiting = useRef<Pending[]>([]);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (p) => setCurrent((c) => { if (c) { waiting.current.push(p); return c; } return p; });
    queue.splice(0).forEach((p) => show!(p));
    return () => { show = null; };
  }, []);

  const finish = (ok: boolean) => {
    if (!current) return;
    if (ok) haptics.tick();
    current.resolve(ok);
    setCurrent(waiting.current.shift() ?? null);
  };

  useEffect(() => {
    if (!current) return;
    // Enter must never delete by accident: destructive dialogs focus Cancel.
    (current.danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const tone = current?.danger ? 'var(--red)' : 'var(--accent)';

  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div
          key="confirm"
          className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-3 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => finish(false)} />
          <motion.div
            role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={current.message ? 'confirm-msg' : undefined}
            className="solid-panel relative w-full max-w-[380px] rounded-[24px] p-5 shadow-2xl"
            style={{ border: '1px solid var(--border)', backgroundImage: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${tone} 10%, transparent), transparent 60%)` }}
            initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 16, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
          >
            <h2 id="confirm-title" className="text-[17px] font-bold leading-snug text-[var(--text-primary)]">{current.title}</h2>
            {current.message && <p id="confirm-msg" className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-secondary)]">{current.message}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button ref={cancelRef} type="button" onClick={() => finish(false)}
                className="h-11 rounded-2xl text-[14px] font-semibold text-[var(--text-primary)] transition-opacity hover:opacity-85 active:scale-[0.98] outline-none focus-visible:ring-1 focus-visible:ring-white/25"
                style={{ background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)' }}>
                {current.cancelLabel ?? 'Cancel'}
              </button>
              <button ref={confirmRef} type="button" onClick={() => finish(true)}
                className="h-11 rounded-2xl text-[14px] font-bold transition-opacity hover:opacity-90 active:scale-[0.98] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                style={current.danger
                  ? { background: 'color-mix(in srgb, var(--red) 20%, transparent)', color: 'var(--red)' }
                  : { background: 'var(--accent)', color: '#000' }}>
                {current.confirmLabel ?? 'OK'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
