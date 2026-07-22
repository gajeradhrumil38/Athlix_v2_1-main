import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, ArrowRight, Share2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CelebrationScreenProps {
  onClose: () => void;
}

export const CelebrationScreen: React.FC<CelebrationScreenProps> = ({ onClose }) => {
  useEffect(() => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-[var(--bg-base)] flex flex-col items-center justify-center p-8 text-center"
    >
      <motion.div 
        initial={{ scale: 0.5, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="w-32 h-32 bg-[var(--pr-gold)]/20 rounded-full flex items-center justify-center mb-8 relative"
      >
        <Trophy className="w-16 h-16 text-[var(--pr-gold)]" />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 border-2 border-dashed border-[var(--pr-gold)]/30 rounded-full"
        />
      </motion.div>

      <motion.h1 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-[32px] font-extrabold text-[var(--text-primary)] mb-2"
      >
        Workout Complete!
      </motion.h1>
      
      <motion.p 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[14px] text-[var(--text-secondary)] mb-12"
      >
        You're one step closer to your goal. <br />
        Keep up the consistency!
      </motion.p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-[320px] mb-12">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl"
        >
          <div className="text-[20px] font-extrabold text-[var(--accent)]">3</div>
          <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">New PRs</div>
        </motion.div>
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl"
        >
          <div className="text-[20px] font-extrabold text-[var(--accent)]">450</div>
          <div className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">Calories</div>
        </motion.div>
      </div>

      <div className="space-y-4 w-full max-w-[320px]">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-[var(--accent)] text-black rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          Back to Dashboard <ArrowRight className="w-5 h-5" />
        </button>
        <button className="btn-glow w-full py-4 text-[var(--text-primary)] font-bold text-[14px] flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" /> Share Summary
        </button>
      </div>
    </motion.div>
  );
};
