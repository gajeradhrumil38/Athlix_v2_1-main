import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

const LEGACY_KEY_STORAGE = 'athlix:gemini_api_key';
const LEGACY_MODEL_STORAGE = 'athlix:gemini_model';

interface SaveResult {
  success: boolean;
  error?: string;
}

// Single source of truth for "does this user have a Gemini key configured".
// The raw key never lives in this hook's state or in localStorage after the
// one-time migration below — only hasKey/model are held client-side.
export function useAiCoachKey() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [loading, setLoading] = useState(true);

  const save = useCallback(async (apiKey: string, targetModel: string): Promise<SaveResult> => {
    const res = await fetch('/api/ai-coach/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model: targetModel }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data?.error?.message || 'Could not validate key.' };
    }
    setHasKey(true);
    setModel(targetModel);
    return { success: true };
  }, []);

  const remove = useCallback(async () => {
    await fetch('/api/ai-coach/keys', { method: 'DELETE' });
    setHasKey(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-coach/keys');
      const data = await res.json();

      // One-time silent migration: a pre-existing localStorage key from
      // before the server-side proxy gets pushed up and the local copy
      // cleared, so the user never has to re-enter it.
      if (!data.hasKey) {
        const legacyKey = localStorage.getItem(LEGACY_KEY_STORAGE)?.trim();
        if (legacyKey) {
          const legacyModel = localStorage.getItem(LEGACY_MODEL_STORAGE) || DEFAULT_MODEL;
          const migrated = await save(legacyKey, legacyModel);
          if (migrated.success) {
            localStorage.removeItem(LEGACY_KEY_STORAGE);
            localStorage.removeItem(LEGACY_MODEL_STORAGE);
            setLoading(false);
            return;
          }
        }
      }

      setHasKey(!!data.hasKey);
      setModel(data.model || DEFAULT_MODEL);
    } catch {
      setHasKey(false);
    } finally {
      setLoading(false);
    }
  }, [save]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { hasKey, model, loading, refresh, save, remove };
}
