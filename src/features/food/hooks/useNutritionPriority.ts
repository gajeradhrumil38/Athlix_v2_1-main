import { useCallback, useEffect, useState } from 'react';

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar';

const STORAGE_KEY = 'athlix:nutrition_priority';
const MAX = 3;
const DEFAULT: MacroKey[] = ['calories', 'protein'];

function load(): MacroKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as MacroKey[];
    return Array.isArray(parsed) ? parsed : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useNutritionPriority() {
  const [priorities, setPriorities] = useState<MacroKey[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(priorities));
  }, [priorities]);

  const toggle = useCallback((key: MacroKey) => {
    setPriorities((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX) return prev;
      return [...prev, key];
    });
  }, []);

  const isPriority = useCallback((key: MacroKey) => priorities.includes(key), [priorities]);

  return { priorities, toggle, isPriority, max: MAX };
}
