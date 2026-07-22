import React, { useEffect, useRef, useState } from 'react';
import { useProgress } from '../../contexts/ProgressContext';

type Phase = 'idle' | 'filling' | 'completing';

export const ProgressBar: React.FC = () => {
  const { isLoading } = useProgress();
  const [phase, setPhase] = useState<Phase>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isLoading) {
      setPhase('filling');
    } else if (phase === 'filling') {
      setPhase('completing');
      timerRef.current = setTimeout(() => setPhase('idle'), 350);
    }
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  if (phase === 'idle') return null;

  return (
    <>
      <style>{`
        @keyframes athlix-progress-fill {
          from { width: 0% }
          to   { width: 85% }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 9999,
          background: 'rgba(200,255,0,0.1)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), #a78bfa)',
            borderRadius: 1,
            ...(phase === 'filling'
              ? { animation: 'athlix-progress-fill 1500ms ease-out forwards' }
              : { width: '100%', opacity: 0, transition: 'width 150ms ease-out, opacity 200ms ease 150ms' }),
          }}
        />
      </div>
    </>
  );
};
