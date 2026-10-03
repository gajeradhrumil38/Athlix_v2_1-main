import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Centered dialog for the coach's Log and Assign flows. A bottom sheet put the
// whole form at the bottom edge of tall screens; centered keeps it in view on
// phone and desktop alike, and the body scrolls inside its own panel.
interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  zIndex?: number;
}

export const CenterModal: React.FC<Props> = ({ open, onClose, children, zIndex = 70 }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        className="fixed inset-0 flex items-center justify-center px-4"
        style={{ zIndex, background: 'rgba(3,5,9,0.88)', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 'min(88vh, 760px)', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
