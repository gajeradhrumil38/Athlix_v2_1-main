import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

const LEGACY_KEY_STORAGE = 'athlix:gemini_api_key';
const LEGACY_MODEL_STORAGE = 'athlix:gemini_model';

// Remembers the last CONFIRMED "a key is stored server-side" answer, so a
// transient auth hiccup on page load (the Supabase session is often still
// restoring/refreshing when this first fires, making GET /keys 401) doesn't
// flip the UI back to "no key" and force the user to re-enter a key that is
// safely saved. Only a clean 200 response, or an explicit remove, changes it.
const CONFIRMED_STORAGE = 'athlix:ai_coach_has_key';
const CONFIRMED_MODEL_STORAGE = 'athlix:ai_coach_model';

const readConfirmed = (): boolean => {
  try { return localStorage.getItem(CONFIRMED_STORAGE) === '1'; } catch { return false; }
};
const writeConfirmed = (has: boolean, model?: string) => {
  try {
    if (has) localStorage.setItem(CONFIRMED_STORAGE, '1');
    else localStorage.removeItem(CONFIRMED_STORAGE);
    if (model) localStorage.setItem(CONFIRMED_MODEL_STORAGE, model);
  } catch { /* storage unavailable — best-effort only */ }
};
const readConfirmedModel = (): string | null => {
  try { return localStorage.getItem(CONFIRMED_MODEL_STORAGE); } catch { return null; }
};

interface SaveResult {
  success: boolean;
  error?: string;
}

// Single source of truth for "does this user have a Gemini key configured".
// The raw key never lives in this hook's state or in localStorage — only
// hasKey/model are held client-side (hasKey also cached, see above).
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
    writeConfirmed(true, targetModel);
    return { success: true };
  }, []);

  const remove = useCallback(async () => {
    await fetch('/api/ai-coach/keys', { method: 'DELETE' });
    setHasKey(false);
    writeConfirmed(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-coach/keys');

      // Auth hiccup (401 / 5xx) — usually the session is still restoring on a
      // fresh load. Don't wipe the prompt-state: trust the last confirmed
      // answer so a stored key isn't wrongly reported as missing.
      if (!res.ok) {
        const confirmed = readConfirmed();
        setHasKey(confirmed);
        const m = readConfirmedModel();
        if (m) setModel(m);
        return;
      }

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
            return;
          }
        }
      }

      // Clean answer from the server — this is authoritative, so it also
      // corrects the cache (e.g. after the key was removed on another device).
      setHasKey(!!data.hasKey);
      setModel(data.model || DEFAULT_MODEL);
      writeConfirmed(!!data.hasKey, data.model);
    } catch {
      // Network error — same as an auth hiccup: fall back to the cache.
      const confirmed = readConfirmed();
      setHasKey(confirmed);
    } finally {
      setLoading(false);
    }
  }, [save]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { hasKey, model, loading, refresh, save, remove };
}
