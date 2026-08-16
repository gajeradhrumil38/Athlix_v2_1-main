import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Breathing edge-glow overlay for cards: a radial gradient bright at the border
 * and fading to a transparent centre, gently pulsing inward (opacity + subtle
 * scale). Tint it with the card's identity colour. Drop it as the first child
 * of a `relative overflow-hidden rounded-2xl` container and lift the content
 * above it with `relative z-10`. Honours prefers-reduced-motion (static rim).
 */
export const CardGlow: React.FC<{ tone: string; className?: string }> = ({ tone, className = 'rounded-2xl' }) => {
  const reduce = useReducedMotion();
  const base = `pointer-events-none absolute inset-0 ${className}`;
  if (reduce) {
    return <div aria-hidden className={base} style={{ background: `radial-gradient(125% 110% at 50% 50%, transparent 54%, ${tone}22 100%)` }} />;
  }
  return (
    <motion.div
      aria-hidden
      className={base}
      style={{ background: `radial-gradient(125% 110% at 50% 50%, transparent 54%, ${tone}2e 100%)`, transformOrigin: 'center' }}
      animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 0.965, 1] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};
