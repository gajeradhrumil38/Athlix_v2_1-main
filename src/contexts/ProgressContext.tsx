import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ProgressContextValue {
  isLoading: boolean;
  startProgress: () => void;
  doneProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue>({
  isLoading: false,
  startProgress: () => {},
  doneProgress: () => {},
});

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState(0);

  const startProgress = useCallback(() => setCount((c) => c + 1), []);
  const doneProgress = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  const value = useMemo(
    () => ({ isLoading: count > 0, startProgress, doneProgress }),
    [count, startProgress, doneProgress],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export const useProgress = () => useContext(ProgressContext);
