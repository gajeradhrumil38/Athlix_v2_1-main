import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  getExerciseTypeOverrides,
  setExerciseTypeOverride as persistOverride,
  clearExerciseTypeOverride as persistClearOverride,
} from '../lib/supabaseData';
import type { ExerciseInputType } from '../lib/exerciseTypes';

interface ExerciseOverridesContextType {
  overrides: Record<string, ExerciseInputType>;
  setOverride: (exerciseName: string, inputType: ExerciseInputType) => Promise<void>;
  clearOverride: (exerciseName: string) => Promise<void>;
}

const ExerciseOverridesContext = createContext<ExerciseOverridesContextType>({
  overrides: {},
  setOverride: async () => {},
  clearOverride: async () => {},
});

export const useExerciseOverrides = () => useContext(ExerciseOverridesContext);

const normalizeKey = (name: string) => name.trim().toLowerCase();

export const ExerciseOverridesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<Record<string, ExerciseInputType>>({});

  useEffect(() => {
    let mounted = true;
    if (!user) {
      setOverrides({});
      return;
    }

    getExerciseTypeOverrides(user.id)
      .then((map) => {
        if (mounted) setOverrides(map);
      })
      .catch((error) => console.warn('Failed to load exercise type overrides:', error));

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Optimistic: update the in-memory map immediately so every screen reflects
  // the change right away, then persist in the background.
  const setOverride = useCallback(
    async (exerciseName: string, inputType: ExerciseInputType) => {
      if (!user) return;
      const key = normalizeKey(exerciseName);
      setOverrides((prev) => ({ ...prev, [key]: inputType }));
      try {
        await persistOverride(user.id, exerciseName, inputType);
      } catch (error) {
        console.warn('Failed to save exercise type override:', error);
      }
    },
    [user?.id],
  );

  const clearOverride = useCallback(
    async (exerciseName: string) => {
      if (!user) return;
      const key = normalizeKey(exerciseName);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        await persistClearOverride(user.id, exerciseName);
      } catch (error) {
        console.warn('Failed to clear exercise type override:', error);
      }
    },
    [user?.id],
  );

  return (
    <ExerciseOverridesContext.Provider value={{ overrides, setOverride, clearOverride }}>
      {children}
    </ExerciseOverridesContext.Provider>
  );
};
