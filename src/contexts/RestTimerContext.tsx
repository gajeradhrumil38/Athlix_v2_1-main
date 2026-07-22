import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Timer, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RestTimerContextType {
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  timeLeft: number;
  isActive: boolean;
}

const RestTimerContext = createContext<RestTimerContextType>({
  startTimer: () => {},
  stopTimer: () => {},
  timeLeft: 0,
  isActive: false,
});

export const RestTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [initialTime, setInitialTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(seconds);
    setInitialTime(seconds);
    setIsActive(true);
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsActive(false);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsActive(false);
    setTimeLeft(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <RestTimerContext.Provider value={{ startTimer, stopTimer, timeLeft, isActive }}>
      {children}
      <AnimatePresence>
        {isActive && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] border border-[var(--accent)]/30 shadow-[0_0_20px_rgba(200,255,0,0.2)] rounded-full px-4 py-2 flex items-center space-x-3 z-50"
          >
            <div className="relative w-6 h-6 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" className="stroke-white/10" strokeWidth="3" />
                <circle 
                  cx="18" cy="18" r="16" 
                  fill="none" 
                  className="stroke-[var(--accent)] transition-all duration-1000 linear" 
                  strokeWidth="3" 
                  strokeDasharray="100.53" 
                  strokeDashoffset={100.53 - (timeLeft / initialTime) * 100.53}
                />
              </svg>
              <Timer className="w-3 h-3 text-[var(--accent)] absolute" />
            </div>
            <span className="text-white font-mono font-bold">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
            <button onClick={stopTimer} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </RestTimerContext.Provider>
  );
};

export const useRestTimer = () => useContext(RestTimerContext);
