import { useCallback, useEffect, useState } from 'react';
import { aiCoachFetch } from '../lib/aiCoachFetch';
import { supabase } from '../lib/supabase';

// Flash-Lite has by far the most generous free-tier daily quota (≈1,000 req/day
// vs ~250 for 2.5-flash, and as low as 20/day on fresh projects), so the coach
// stops hitting "quota exceeded". Same key, same API.
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// Allowlist of currently-valid Gemini models. Anything else — low-quota
// (2.5-flash), retired (2.0/1.5-flash), or dead preview snapshots like
// gemini-2.5-flash-preview-05-20 — is migrated to Flash-Lite on read, so a
// stale stored model can never 404 the coach.
const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-pro']);
export const normalizeModel = (m?: string | null): string =>
  m && ALLOWED_MODELS.has(m) ? m : DEFAULT_MODEL;

// Set when a shared Groq key is configured server-side (GROQ_API_KEY). With Groq
// as the primary provider, the coach works even if the user has no Gemini key,
// so the "add a key" gate is lifted.
export const GROQ_ENABLED =
  import.meta.env.VITE_GROQ_ENABLED === '1' || import.meta.env.VITE_GROQ_ENABLED === 'true';

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
  try {
    const m = localStorage.getItem(CONFIRMED_MODEL_STORAGE);
    return m ? normalizeModel(m) : null;
  } catch { return null; }
};

interface SaveResult {
  success: boolean;
  error?: string;
}

// Single source of truth for "does this user have a Gemini key configured".
// The raw key never lives in this hook's state or in localStorage — only
// hasKey/model are held client-side (hasKey also cached, see above).
export function useAiCoachKey() {
  const [hasKey, setHasKey] = useState<boolean | null>(GROQ_ENABLED ? true : null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [loading, setLoading] = useState(true);

  const save = useCallback(async (apiKey: string, targetModel: string): Promise<SaveResult> => {
    const res = await aiCoachFetch('/api/ai-coach/keys', {
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

  // Save a personal Groq key — the coach's primary provider. Once set, the coach
  // runs on the user's own Groq quota (no shared-key rate-limit, no reliance on
  // the Gemini fallback).
  const saveGroq = useCallback(async (groqApiKey: string): Promise<SaveResult> => {
    const res = await aiCoachFetch('/api/ai-coach/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groqApiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { success: false, error: data?.error?.message || 'Could not validate Groq key.' };
    }
    setHasKey(true);
    writeConfirmed(true, model);
    return { success: true };
  }, [model]);

  const remove = useCallback(async () => {
    await aiCoachFetch('/api/ai-coach/keys', { method: 'DELETE' });
    // Removing the personal Gemini key doesn't disable the coach when a shared
    // Groq key is serving it.
    setHasKey(GROQ_ENABLED ? true : false);
    writeConfirmed(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Presence-check via the SPA's OWN Supabase session — the reliable one
      // the whole app already runs on — NOT the Next.js /api/ai-coach/keys
      // route. That route's cookie/Bearer auth races the iframe session
      // injection on mount, so on reopen it intermittently 401'd and reported
      // the stored key as missing, re-showing the "add key" prompt. Reading
      // ai_coach_keys directly under RLS (only the `model` column — never the
      // key itself) is authoritative and race-free.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Session not ready yet — don't clear the prompt-state; trust cache.
        setHasKey(GROQ_ENABLED || readConfirmed());
        const m = readConfirmedModel();
        if (m) setModel(m);
        return;
      }

      const { data, error } = await supabase
        .from('ai_coach_keys')
        .select('model')
        .maybeSingle();

      if (error) {
        setHasKey(GROQ_ENABLED || readConfirmed());
        const m = readConfirmedModel();
        if (m) setModel(m);
        return;
      }

      if (data) {
        // Found — authoritative positive. Update state + cache.
        const modelValue = normalizeModel(data.model as string | undefined);
        setHasKey(true);
        setModel(modelValue);
        writeConfirmed(true, modelValue);
        return;
      }

      // No row found. Try the one-time migration of a legacy localStorage key.
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

      // "Not found" does NOT downgrade a confirmed key. The cache is only ever
      // set on a CONFIRMED save (so cache=true means the key really was saved),
      // whereas this read can transiently miss (session mid-refresh, RLS timing
      // in the iframe). Only remove() clears the cache. So a returning user who
      // added a key is never re-prompted; a brand-new user (cache empty) still
      // correctly sees the prompt.
      const cached = readConfirmed();
      setHasKey(GROQ_ENABLED || cached);
      const m = readConfirmedModel();
      if (m) setModel(m);
    } catch {
      setHasKey(GROQ_ENABLED || readConfirmed());
    } finally {
      setLoading(false);
    }
  }, [save]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { hasKey, model, loading, refresh, save, saveGroq, remove };
}
