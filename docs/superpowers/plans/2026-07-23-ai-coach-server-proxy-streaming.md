# AI Coach Server-Side Proxy + Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `AiChat.tsx` and `PostWorkoutCoachPill.tsx`'s direct-to-Gemini calls behind a Next.js route handler that holds the user's Gemini API key server-side, and give `AiChat.tsx` real token-by-token streaming instead of a post-hoc typewriter simulation.

**Architecture:** A new `ai_coach_keys` Supabase table (RLS-scoped, owner-CRUD) stores each user's Gemini key server-side. Two new Next.js route handlers — `app/api/ai-coach/keys/route.ts` (validate/save/read/delete the key) and `app/api/ai-coach/generate/route.ts` (thin proxy to Gemini, streaming or not) — sit behind the existing cookie-based Supabase auth (`createRouteHandlerSupabaseClient()`, proven at `app/api/protected/route.ts`). A new shared hook, `src/hooks/useAiCoachKey.ts`, wraps both routes and handles a one-time silent migration from the old `localStorage` key. `AiChat.tsx`, `PostWorkoutCoachPill.tsx`, and `Settings.tsx` all swap their direct Gemini `fetch()` / `localStorage` calls for this hook + the new proxy endpoint. The existing hand-rolled Gemini request/response shape (tool declarations, `executeTool` dispatcher, retry/fallback-model logic) is preserved exactly — only the transport changes.

**Tech Stack:** Next.js 14 App Router route handlers, `@supabase/ssr` cookie-based auth, native `fetch`/`ReadableStream`/SSE parsing (no new npm dependencies).

**Note on testing:** This repo has no automated test runner (`package.json`'s `"test"` script is a no-op placeholder, confirmed in `package.json:12`). Every task's verification step is therefore `npx tsc --noEmit` (root — covers `app/**`, `lib/**`) **and** `npx tsc -p src/tsconfig.json --noEmit` (covers `src/**` — the root config `exclude`s `src/`, so both must be run), plus `npm run build`, plus a manual QA step where relevant. This mirrors how every other change in this codebase's history has been verified.

---

### Task 1: `ai_coach_keys` table + generated types

**Files:**
- Create: `supabase/migrations/20260723000001_ai_coach_keys.sql`
- Modify: `supabase/schema.sql` (append the same table definition, mirroring existing convention)
- Modify: `lib/database.types.ts:1-32`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260723000001_ai_coach_keys.sql`:

```sql
CREATE TABLE public.ai_coach_keys (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gemini_api_key  TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.ai_coach_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_ai_coach_key"
  ON public.ai_coach_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply it to the live Supabase project**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with the project used throughout this codebase's history (`mrntwydykqsdawpklumf`, "AthlixV2"), `name: "ai_coach_keys"`, and the SQL from Step 1.

- [ ] **Step 3: Mirror the table into `supabase/schema.sql`**

Append the identical `CREATE TABLE` / `ALTER TABLE` / `CREATE POLICY` block from Step 1 to the end of `supabase/schema.sql`, matching how every other table in that file is recorded (this file is the checked-in source of truth, separate from the live migration history).

- [ ] **Step 4: Add the table to `lib/database.types.ts`**

This file is a hand-maintained stub (currently only declares `profiles` — confirmed by reading it in full, 32 lines) rather than a CLI-generated file, so extend it by hand in the same style. Replace the full file content:

```ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string | null;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      ai_coach_keys: {
        Row: {
          user_id: string;
          gemini_api_key: string;
          model: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          gemini_api_key: string;
          model?: string;
          updated_at?: string;
        };
        Update: {
          gemini_api_key?: string;
          model?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` (from repo root)
Expected: same output as before this change (this step only adds a type, nothing consumes it yet).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260723000001_ai_coach_keys.sql supabase/schema.sql lib/database.types.ts
git commit -m "Add ai_coach_keys table for server-side Gemini key storage"
```

---

### Task 2: Key management route handler

**Files:**
- Create: `app/api/ai-coach/keys/route.ts`

- [ ] **Step 1: Write the route handler**

Create `app/api/ai-coach/keys/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function GET() {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { data: row } = await supabase
    .from('ai_coach_keys')
    .select('model')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ hasKey: !!row, model: row?.model || DEFAULT_MODEL });
}

export async function POST(req: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { apiKey, model } = await req.json();
  const trimmed = (typeof apiKey === 'string' ? apiKey : '').trim();
  const targetModel = (typeof model === 'string' && model) || DEFAULT_MODEL;

  if (!trimmed) {
    return NextResponse.json({ success: false, error: { message: 'API key is required.' } }, { status: 400 });
  }

  // Validate the key against Gemini before persisting it — same one-token
  // probe request the old client-side ApiKeySetupModal used to make.
  const validateRes = await fetch(`${GEMINI_BASE}/gemini-2.5-flash:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': trimmed },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
  });

  if (!validateRes.ok) {
    const errBody = await validateRes.json().catch(() => ({}));
    const msg: string = errBody?.error?.message || `Error ${validateRes.status}`;
    const friendly = msg.includes('API_KEY') || validateRes.status === 400 ? 'Invalid key — check and try again.' : msg;
    return NextResponse.json({ success: false, error: { message: friendly } }, { status: 400 });
  }

  const { error: upsertError } = await supabase
    .from('ai_coach_keys')
    .upsert({ user_id: user.id, gemini_api_key: trimmed, model: targetModel, updated_at: new Date().toISOString() });

  if (upsertError) {
    return NextResponse.json({ success: false, error: { message: 'Could not save key. Try again.' } }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  await supabase.from('ai_coach_keys').delete().eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` (from repo root)
Expected: no new errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, then in a separate terminal, with a real logged-in session cookie from the browser (or simply hit it from the running app once logged in via browser dev tools' fetch console):
```js
fetch('/api/ai-coach/keys').then(r => r.json()).then(console.log)
```
Expected: `{ hasKey: false, model: 'gemini-2.5-flash' }` for a fresh user (or `{ hasKey: true, ... }` if a migration already ran from a later task).

- [ ] **Step 4: Commit**

```bash
git add app/api/ai-coach/keys/route.ts
git commit -m "Add server-side Gemini key management route (validate/save/read/delete)"
```

---

### Task 3: Generate proxy route handler (with streaming)

**Files:**
- Create: `app/api/ai-coach/generate/route.ts`

- [ ] **Step 1: Write the route handler**

Create `app/api/ai-coach/generate/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function POST(req: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { data: keyRow } = await supabase
    .from('ai_coach_keys')
    .select('gemini_api_key')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!keyRow?.gemini_api_key) {
    return NextResponse.json({ error: { code: 'NO_KEY', message: 'No Gemini API key configured.' } }, { status: 400 });
  }

  const { model, stream, ...body } = await req.json();
  const targetModel = (typeof model === 'string' && model) || DEFAULT_MODEL;

  const endpoint = stream
    ? `${GEMINI_BASE}/${targetModel}:streamGenerateContent?alt=sse`
    : `${GEMINI_BASE}/${targetModel}:generateContent`;

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keyRow.gemini_api_key },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    // Pass Gemini's own error status + body through unmodified, so the
    // client's existing status/message-based retry logic (quota, invalid
    // key, overload detection) keeps working without changes.
    const errBody = await upstream.json().catch(() => ({}));
    return NextResponse.json(errBody, { status: upstream.status });
  }

  if (stream) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` (from repo root)
Expected: no new errors.

- [ ] **Step 3: Manual smoke test (requires Task 2's key already saved for your test user)**

```js
fetch('/api/ai-coach/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemini-2.5-flash',
    stream: false,
    contents: [{ role: 'user', parts: [{ text: 'Say hi in 3 words.' }] }],
    generationConfig: { maxOutputTokens: 50 },
  }),
}).then(r => r.json()).then(console.log)
```
Expected: a Gemini `generateContent` response JSON with `candidates[0].content.parts[0].text`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai-coach/generate/route.ts
git commit -m "Add streaming-capable Gemini proxy route handler"
```

---

### Task 4: Shared `useAiCoachKey` hook

**Files:**
- Create: `src/hooks/useAiCoachKey.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useAiCoachKey.ts`:

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -p src/tsconfig.json --noEmit`
Expected: same 10 pre-existing errors as the baseline (`ExerciseBlock.tsx`, `WeightRepsPicker.tsx`, `aiCoach.ts`, `supabaseData.ts`, `main.tsx`, `Home.tsx`, `Timeline.tsx` — confirm via `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l` returning `23`), no new ones.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiCoachKey.ts
git commit -m "Add useAiCoachKey hook: server-backed key state + localStorage migration"
```

---

### Task 5: Rewire Settings.tsx

**Files:**
- Modify: `src/pages/Settings.tsx:1` (import), `:291-298` (state), `:412-422` (save handler), `:822-858` (UI)

- [ ] **Step 1: Add the import**

In `src/pages/Settings.tsx`, after the existing `whoopService` import (line 12), add:

```tsx
import { useAiCoachKey } from '../hooks/useAiCoachKey';
```

- [ ] **Step 2: Replace the Gemini key state**

Replace `src/pages/Settings.tsx:291-298`:

```tsx
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem('athlix:gemini_api_key') || ''
  );
  const [geminiModel, setGeminiModel] = useState(
    () => localStorage.getItem('athlix:gemini_model') || 'gemini-2.5-flash'
  );
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
```

with:

```tsx
  const { hasKey: hasGeminiKey, model: savedGeminiModel, loading: geminiKeyLoading, save: saveAiCoachKey, remove: removeAiCoachKey } = useAiCoachKey();
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiError, setGeminiError] = useState('');
  const [geminiSaved, setGeminiSaved] = useState(false);

  useEffect(() => {
    if (!geminiKeyLoading) setGeminiModel(savedGeminiModel);
  }, [geminiKeyLoading, savedGeminiModel]);
```

- [ ] **Step 3: Replace the save handler**

Replace `src/pages/Settings.tsx:412-422`:

```tsx
  const saveGeminiKey = () => {
    const trimmed = geminiKey.trim();
    if (trimmed) {
      localStorage.setItem('athlix:gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('athlix:gemini_api_key');
    }
    localStorage.setItem('athlix:gemini_model', geminiModel);
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  };
```

with:

```tsx
  const saveGeminiKey = async () => {
    const trimmed = geminiKeyInput.trim();
    if (!trimmed) return;
    setGeminiSaving(true);
    setGeminiError('');
    const result = await saveAiCoachKey(trimmed, geminiModel);
    setGeminiSaving(false);
    if (!result.success) {
      setGeminiError(result.error || 'Could not save key.');
      return;
    }
    setGeminiKeyInput('');
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  };

  const removeGeminiKey = async () => {
    await removeAiCoachKey();
    setGeminiKeyInput('');
  };
```

- [ ] **Step 4: Replace the key input/save/remove UI**

Replace `src/pages/Settings.tsx:822-858`:

```tsx
          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveGeminiKey()}
              placeholder="AIza…"
              className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-10 text-[13px] text-[var(--text-primary)] outline-none focus:border-purple-500/50 transition-colors placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={saveGeminiKey}
            className="w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 text-white transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', opacity: geminiSaved ? 0.7 : 1 }}
          >
            {geminiSaved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save API Key</>
            )}
          </button>
          {geminiKey && (
            <button
              type="button"
              onClick={() => { setGeminiKey(''); localStorage.removeItem('athlix:gemini_api_key'); }}
              className="w-full text-[12px] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
            >
              Remove key
            </button>
          )}
```

with:

```tsx
          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiKeyInput}
              onChange={(e) => { setGeminiKeyInput(e.target.value); setGeminiError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && saveGeminiKey()}
              placeholder={hasGeminiKey ? 'Key configured — paste a new one to replace it' : 'AIza…'}
              className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-10 text-[13px] text-[var(--text-primary)] outline-none focus:border-purple-500/50 transition-colors placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {geminiError && <p className="text-[12px] text-red-400">{geminiError}</p>}
          <button
            onClick={saveGeminiKey}
            disabled={geminiSaving || !geminiKeyInput.trim()}
            className="w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 text-white transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', opacity: geminiSaved ? 0.7 : 1 }}
          >
            {geminiSaving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Validating…</>
            ) : geminiSaved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save API Key</>
            )}
          </button>
          {hasGeminiKey && (
            <button
              type="button"
              onClick={removeGeminiKey}
              className="w-full text-[12px] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
            >
              Remove key
            </button>
          )}
```

`Loader2` and `CheckCircle` are already imported at `src/pages/Settings.tsx:6` — no new icon imports needed.

- [ ] **Step 5: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (the pre-existing baseline — same 10 errors, none in `Settings.tsx`).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual test**

`npm run dev`, sign in, go to Settings → AI Coach section:
- Paste an invalid key → "Invalid key — check and try again." shown inline, nothing saved.
- Paste a real Gemini key → "Validating…" then "Saved!", input clears, placeholder changes to "Key configured — paste a new one to replace it", "Remove key" button appears.
- Click "Remove key" → placeholder reverts to "AIza…", "Remove key" button disappears.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "Settings: store Gemini key server-side via useAiCoachKey"
```

---

### Task 6: AiChat.tsx — key setup modal + hasKey gating (non-streaming parts)

**Files:**
- Modify: `src/components/ai/AiChat.tsx:1-32` (imports), `:57-64` (constants), `:378-546` (`ApiKeySetupModal`), `:566-570` (state), `:609-613` (`openChat`), `:680` (guard), `:831` (deps), `:938,983` (modal call sites), `:940-960,985-...` (`ChatContent` call sites — `apiKey` prop), `:1266,1288,1341` (`ChatContentProps`)

- [ ] **Step 1: Update imports and remove now-unused local constants**

In `src/components/ai/AiChat.tsx`, replace the import block at lines 27-32:

```tsx
import {
  type WorkoutWithExercises,
  buildSystemPrompt,
  calDaysSince,
  parseSkincareStats,
} from '../../lib/aiCoach';
```

with:

```tsx
import {
  type WorkoutWithExercises,
  buildSystemPrompt,
  calDaysSince,
  parseSkincareStats,
} from '../../lib/aiCoach';
import { useAiCoachKey, DEFAULT_MODEL } from '../../hooks/useAiCoachKey';
```

Replace lines 57-62:

```tsx
const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const USAGE_STORAGE = 'athlix:api_usage';
const CHAT_HISTORY_STORAGE = 'athlix:ai_chat_history';
const DEFAULT_MODEL = 'gemini-2.5-flash'; // free tier: 5 RPM, 250K tokens/min
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
```

with:

```tsx
const USAGE_STORAGE = 'athlix:api_usage';
const CHAT_HISTORY_STORAGE = 'athlix:ai_chat_history';
```

(`DEFAULT_MODEL` now comes from the hook import; `GEMINI_KEY_STORAGE`/`GEMINI_MODEL_STORAGE`/`GEMINI_BASE` are no longer used anywhere in this file after Task 7.)

- [ ] **Step 2: Rewrite `ApiKeySetupModal`**

Replace `src/components/ai/AiChat.tsx:378-418` (the component signature through the end of `validate`):

```tsx
const ApiKeySetupModal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [key, setKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showWhy, setShowWhy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  const validate = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Paste your API key first.'); return; }
    setValidating(true);
    setError('');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = (body as any)?.error?.message || `Error ${res.status}`;
        setError(msg.includes('API_KEY') || res.status === 400 ? 'Invalid key — check and try again.' : msg);
        return;
      }
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
      setStep(3);
      setTimeout(onDone, 1200);
    } catch {
      setError('Could not reach Gemini. Check your connection.');
    } finally {
      setValidating(false);
    }
  };
```

with:

```tsx
const ApiKeySetupModal: React.FC<{ onDone: () => void; onSave: (apiKey: string, model: string) => Promise<{ success: boolean; error?: string }> }> = ({ onDone, onSave }) => {
  const [key, setKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showWhy, setShowWhy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  const validate = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Paste your API key first.'); return; }
    setValidating(true);
    setError('');
    const result = await onSave(trimmed, DEFAULT_MODEL);
    setValidating(false);
    if (!result.success) {
      setError(result.error || 'Invalid key — check and try again.');
      return;
    }
    setStep(3);
    setTimeout(onDone, 1200);
  };
```

Then update the "Why do I need this?" copy, which is no longer accurate — replace `src/components/ai/AiChat.tsx:538-541`:

```tsx
          <p className="mt-2 text-[12px] text-white/40 leading-relaxed">
            Your key is stored only on this device — never sent to Athlix servers. All AI requests go
            directly from your browser to Google's Gemini API. You can revoke it anytime at aistudio.google.com.
          </p>
```

with:

```tsx
          <p className="mt-2 text-[12px] text-white/40 leading-relaxed">
            Your key is stored securely on our server, tied to your account — it never sits in your
            browser after this step. You can remove it anytime in Settings, or revoke it directly at
            aistudio.google.com.
          </p>
```

- [ ] **Step 3: Replace key/model state in the main component**

Replace `src/components/ai/AiChat.tsx:566-570`:

```tsx
  const [showKeySetup, setShowKeySetup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
  const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;
```

with:

```tsx
  const [showKeySetup, setShowKeySetup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { hasKey, model, save: saveAiCoachKey } = useAiCoachKey();
```

- [ ] **Step 4: Update `openChat`**

Replace `src/components/ai/AiChat.tsx:609-613`:

```tsx
  const openChat = () => {
    const key = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!key) { setShowKeySetup(true); setOpen(true); }
    else { setShowKeySetup(false); setOpen(true); }
  };
```

with:

```tsx
  const openChat = () => {
    if (!hasKey) { setShowKeySetup(true); setOpen(true); }
    else { setShowKeySetup(false); setOpen(true); }
  };
```

- [ ] **Step 5: Update the `send()` early-return guard and dependency array**

At `src/components/ai/AiChat.tsx:680`, change:

```tsx
      if (!text || loading || !apiKey) return;
```

to:

```tsx
      if (!text || loading || !hasKey) return;
```

At `src/components/ai/AiChat.tsx:831` (the `useCallback` deps array — exact final form depends on Task 7's rewrite of `send()`, but the `apiKey` → `hasKey` substitution applies regardless):

```tsx
    [input, loading, apiKey, model, profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats, messages],
```

becomes (as a starting point — Task 7 adds `user?.id` and `navigate`):

```tsx
    [input, loading, hasKey, model, profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats, messages],
```

- [ ] **Step 6: Update `ApiKeySetupModal` call sites**

At `src/components/ai/AiChat.tsx:938` and `:983`, both instances of:

```tsx
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} />
```

become:

```tsx
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} onSave={saveAiCoachKey} />
```

- [ ] **Step 7: Rename the `apiKey` prop to `hasKey` on `ChatContent`**

At `src/components/ai/AiChat.tsx:941` and `:986`, both instances of:

```tsx
                apiKey={apiKey}
```

become:

```tsx
                hasKey={!!hasKey}
```

At `src/components/ai/AiChat.tsx:1266`, change the prop type:

```tsx
  apiKey: string;
```

to:

```tsx
  hasKey: boolean;
```

At `src/components/ai/AiChat.tsx:1288`, change the destructure:

```tsx
  apiKey, messages, suggestions, input, loading, loadingPhase, copiedIdx,
```

to:

```tsx
  hasKey, messages, suggestions, input, loading, loadingPhase, copiedIdx,
```

At `src/components/ai/AiChat.tsx:1341`, change:

```tsx
    {!apiKey ? (
```

to:

```tsx
    {!hasKey ? (
```

- [ ] **Step 8: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: still `23` — this step doesn't yet touch `send()`'s internals (that's Task 7), so any leftover reference to the removed `GEMINI_KEY_STORAGE`/`apiKey`/`GEMINI_BASE` constants inside `send()` will surface as new TypeScript errors here. That's expected and confirms Task 7 is necessary — do not attempt to silence them; proceed to Task 7 which replaces that code.

- [ ] **Step 9: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "AiChat: key setup modal + hasKey gating via useAiCoachKey"
```

---

### Task 7: AiChat.tsx — streaming `send()` + live streaming bubble

**Files:**
- Modify: `src/components/ai/AiChat.tsx` (state additions near `:566-570`, full `send()` replacement at `:677-832`, `ChatContentProps`/`ChatContent` streaming prop threading, loading-bubble render at `:1556-1584`)

This task replaces the direct-to-Gemini `fetchWithRetry` in `send()` with two proxy-backed helpers — a streaming one for the initial turn, a non-streaming one for the tool-call follow-up turn — and adds a `streamingText` state so the UI renders tokens as they arrive instead of waiting for the full response.

- [ ] **Step 1: Add `streamingText` state**

Immediately after the `useAiCoachKey()` line added in Task 6 Step 3, add:

```tsx
  const [streamingText, setStreamingText] = useState('');
```

- [ ] **Step 2: Replace `send()` in full**

Replace `src/components/ai/AiChat.tsx:677-832` (from `const send = useCallback(` through the closing `);` of the `useCallback`) with:

```tsx
  /* ── Send message to Gemini via the server proxy, streaming the reply ── */
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading || !hasKey) return;

      const userMsg: Message = { role: 'user', text };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput('');
      setLoading(true);
      setStreamingText('');

      try {
        const systemPrompt = buildSystemPrompt(profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats);
        const trimmedHistory = history.slice(-MAX_HISTORY);
        const geminiContents = trimmedHistory.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        const buildBody = (contents: object[], targetModel: string, stream: boolean) => ({
          model: targetModel,
          stream,
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
          generationConfig: {
            temperature: 1,
            maxOutputTokens: 2048,
            ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 1024 } }),
          },
        });

        const isOverloaded = (status: number, msg: string) =>
          status === 503 || status === 429 && msg.includes('quota') === false ||
          msg.toLowerCase().includes('high demand') ||
          msg.toLowerCase().includes('overloaded') ||
          msg.toLowerCase().includes('try again');

        const FALLBACK_MODEL = 'gemini-1.5-flash';
        const RETRY_DELAYS = [1200, 2500]; // ms between attempts

        // Streaming request through the proxy, with the same retry/fallback
        // policy the old direct-to-Gemini fetchWithRetry used.
        const streamWithRetry = async (contents: object[]): Promise<Response> => {
          for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            const targetModel = attempt < RETRY_DELAYS.length ? model : FALLBACK_MODEL;
            const res = await fetch('/api/ai-coach/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildBody(contents, targetModel, true)),
            });
            if (res.ok) return res;

            const errBody = await res.clone().json().catch(() => ({}));
            const errMsg: string = errBody?.error?.message || `Request failed (${res.status})`;

            if (res.status === 400 && errBody?.error?.code === 'NO_KEY') {
              throw new Error('INVALID_KEY: No Gemini API key configured. Set one up in Settings.');
            }
            if (res.status === 429 && errMsg.includes('quota')) {
              throw new Error('QUOTA: Your API key\'s project has billing enabled, which sets the free tier limit to 0.\n\nFix: Go to aistudio.google.com/app/apikey → "Create API key in new project" (no billing) → paste the new key in Settings.');
            }
            if (res.status === 400 && errMsg.includes('API_KEY')) {
              throw new Error('INVALID_KEY: Your API key is invalid. Check it in Settings.');
            }
            if (isOverloaded(res.status, errMsg) && attempt < RETRY_DELAYS.length) {
              await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
              continue;
            }
            throw new Error(errMsg);
          }
          throw new Error('All retry attempts failed.');
        };

        // Non-streaming request through the proxy — used only for the short
        // tool-result follow-up turn, which doesn't need live token rendering.
        const generateOnce = async (contents: object[], targetModel: string): Promise<any> => {
          const res = await fetch('/api/ai-coach/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(contents, targetModel, false)),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody?.error?.message || `Request failed (${res.status})`);
          }
          return res.json();
        };

        // Read Gemini's SSE stream, concatenating text deltas live and
        // capturing a function-call part if the model calls a tool instead
        // of replying with text (tool calls arrive as one complete part,
        // not incrementally, so there's nothing to stream for that case).
        const consumeStream = async (
          res: Response,
          onTextDelta: (accumulated: string) => void,
        ): Promise<{ text: string; thought: string; functionCall?: { name: string; args: Record<string, unknown> }; usageTokens: number }> => {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';
          let accumulatedThought = '';
          let functionCall: { name: string; args: Record<string, unknown> } | undefined;
          let usageTokens = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              let chunk: any;
              try { chunk = JSON.parse(jsonStr); } catch { continue; }

              if (chunk?.usageMetadata?.totalTokenCount) usageTokens = chunk.usageMetadata.totalTokenCount;

              const parts: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }> =
                chunk?.candidates?.[0]?.content?.parts || [];
              for (const p of parts) {
                if (p.functionCall) functionCall = p.functionCall;
                if (p.text && p.thought) accumulatedThought += p.text;
                if (p.text && !p.thought) {
                  accumulated += p.text;
                  onTextDelta(accumulated);
                }
              }
            }
          }
          return { text: accumulated, thought: accumulatedThought, functionCall, usageTokens };
        };

        const res = await streamWithRetry(geminiContents);
        const { text: streamedText, thought, functionCall, usageTokens } = await consumeStream(res, setStreamingText);
        trackTokenUsage(usageTokens);

        // ── Function call branch ─────────────────────────────────────────
        if (functionCall && user?.id) {
          const { name: toolName, args: toolArgs } = functionCall;
          let toolResult: ToolResult;
          try {
            toolResult = await executeTool(user.id, toolName, toolArgs, navigate);
          } catch (e: any) {
            toolResult = { success: false, message: e.message || 'Action failed' };
          }

          if (toolResult.showForm) {
            setStreamingText('');
            setMessages((prev) => [...prev, {
              role: 'model',
              text: toolResult.formInitialName
                ? `Fill in the details for **${toolResult.formInitialName}**:`
                : "Here's a quick form to log your exercise:",
              exerciseForm: true,
              exerciseFormInitialName: toolResult.formInitialName || '',
            }]);
            return;
          }

          const followUpContents = [
            ...geminiContents,
            { role: 'model', parts: [{ functionCall }] },
            { role: 'user', parts: [{ functionResponse: { name: toolName, response: toolResult } }] },
          ];
          const data2 = await generateOnce(followUpContents, model);
          trackTokenUsage(data2?.usageMetadata?.totalTokenCount ?? 0);

          const finalParts: Array<{ text?: string; thought?: boolean }> = data2?.candidates?.[0]?.content?.parts || [];
          const aiText2 = finalParts.filter((p) => !p.thought).map((p) => p.text).join('').trim() || 'Done!';

          setStreamingText('');
          setMessages((prev) => [...prev, { role: 'model', text: aiText2, action: toolResult }]);
          return;
        }

        // ── Normal text response branch ──────────────────────────────────
        setStreamingText('');
        setMessages((prev) => [...prev, { role: 'model', text: streamedText.trim() || '(no response)', thought: thought || undefined }]);
      } catch (err: any) {
        const raw: string = err?.message || 'Something went wrong.';
        const display = raw.startsWith('QUOTA:')
          ? raw.replace('QUOTA:', '⚠️ Quota issue —')
          : raw.startsWith('INVALID_KEY:')
            ? raw.replace('INVALID_KEY:', '🔑 Invalid key —')
            : `⚠️ ${raw}`;
        setStreamingText('');
        setMessages((prev) => [...prev, { role: 'model', text: display }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, hasKey, model, profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats, messages, user?.id, navigate],
  );
```

- [ ] **Step 3: Thread `streamingText` down to `ChatContent`**

At `src/components/ai/AiChat.tsx:1266` (`ChatContentProps`, right after the `loadingPhase: number;` line added by Task 6), add:

```tsx
  streamingText: string;
```

At `src/components/ai/AiChat.tsx:1288` (the destructure), add `streamingText` after `loadingPhase`:

```tsx
  hasKey, messages, suggestions, input, loading, loadingPhase, streamingText, copiedIdx,
```

At both `<ChatContent ... />` call sites (`:941-947` area and `:986-992` area — same line numbers as Task 6 Step 6/7 left them), add `streamingText={streamingText}` alongside the existing `loadingPhase={loadingPhase}` line:

```tsx
                loadingPhase={loadingPhase}
                streamingText={streamingText}
```

- [ ] **Step 4: Render the streaming bubble**

Replace `src/components/ai/AiChat.tsx:1556-1575` — the `{loading && ( ... )}` block — so it shows the existing loading-dots bubble only until the first token arrives, then switches to a live-updating text bubble matching the normal model-message style:

```tsx
          {/* Loading indicator, or live-streaming reply once tokens start arriving */}
          {loading && !streamingText && (
            <div className="flex gap-2 justify-start">
              <div
                className="ai-aurora-static flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
              >
                <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px 14px 14px 4px',
                  padding: 0,
                }}
              >
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
                  <p className="text-[11px] animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    {LOADING_PHASES[loadingPhase]}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="block rounded-full animate-bounce"
                        style={{ width: 6, height: 6, background: 'var(--text-muted)', animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {loading && streamingText && (
            <div className="flex gap-2 justify-start">
              <div
                className="ai-aurora-static flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
              >
                <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
              </div>
              <div
                className="text-[13px] leading-[1.55] word-break"
                style={{
                  padding: '10px 13px',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  borderRadius: '14px 14px 14px 4px',
                  border: '1px solid var(--border)',
                  wordBreak: 'break-word',
                  maxWidth: '78%',
                }}
              >
                {renderText(streamingText)}
              </div>
            </div>
          )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (back to the pre-existing baseline — this task resolves the errors Task 6 Step 8 expected).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Manual test**

`npm run dev`, sign in with a user who has a Gemini key configured (Task 5's manual test), open AI Coach:
- Send a plain question ("What should I train today?") → verify the reply renders incrementally (text growing token-by-token), not a single jump from empty to full.
- Send "log 80kg" (a `log_weight` tool call) → verify it still logs correctly and shows the confirmation card (unchanged tool-calling behavior).
- Name an exercise without sets/reps ("bench press") → verify the inline exercise form still appears.
- Trigger an invalid-key or overload scenario if feasible (e.g., temporarily use an invalid key) → verify the same error copy/retry behavior as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "AiChat: stream Gemini replies through the server proxy instead of typewriter-simulating"
```

---

### Task 8: PostWorkoutCoachPill.tsx — proxy rewire

**Files:**
- Modify: `src/components/ai/PostWorkoutCoachPill.tsx:1-22` (imports/constants), `:178-263` (`runInsight`)

- [ ] **Step 1: Update imports and constants**

Replace `src/components/ai/PostWorkoutCoachPill.tsx:1-22`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import type { WorkoutComparison } from '../../lib/supabaseData';

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';
const ANALYZING_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 60_000;
const COLLAPSED_AUTO_DISMISS_MS = 30_000;
const TYPE_CHAR_MS = 24;
```

with:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import type { WorkoutComparison } from '../../lib/supabaseData';
import { useAiCoachKey } from '../../hooks/useAiCoachKey';

const FALLBACK_MODEL = 'gemini-1.5-flash';
const ANALYZING_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 60_000;
const COLLAPSED_AUTO_DISMISS_MS = 30_000;
const TYPE_CHAR_MS = 24;
```

- [ ] **Step 2: Use the hook in the component and rewrite `runInsight`**

Replace `src/components/ai/PostWorkoutCoachPill.tsx:127-263` (from `export const PostWorkoutCoachPill: React.FC = () => {` through the closing `}, [user?.id, profile, startTyping]);` of `runInsight`) with:

```tsx
export const PostWorkoutCoachPill: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const isImmersiveRoute = location.pathname === '/log' || location.pathname.startsWith('/run');
  const { hasKey, model } = useAiCoachKey();

  const [view, setView] = useState<View>('closed');
  const [message, setMessage] = useState('');
  const [typedText, setTypedText] = useState('');
  const [typingDone, setTypingDone] = useState(false);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);
  const lastFiredAtRef = useRef(0);

  useEffect(() => {
    if (document.getElementById('pwcp-keyframes')) return;
    const el = document.createElement('style');
    el.id = 'pwcp-keyframes';
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startTyping = useCallback((full: string) => {
    setTypedText('');
    setTypingDone(false);
    setView('typing');
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    let i = 0;
    typeTimerRef.current = setInterval(() => {
      i++;
      setTypedText(full.slice(0, i));
      if (i >= full.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        setTypingDone(true);
        setTimeout(() => {
          setView('collapsed');
          clearDismissTimer();
          dismissTimerRef.current = setTimeout(() => setView((v) => (v === 'collapsed' ? 'closed' : v)), COLLAPSED_AUTO_DISMISS_MS);
        }, 550);
      }
    }, TYPE_CHAR_MS);
  }, [clearDismissTimer]);

  const runInsight = useCallback(async (detail: WorkoutFinishedDetail) => {
    if (!user?.id) return;

    const now = Date.now();
    if (now - lastFiredAtRef.current < COOLDOWN_MS) return;
    lastFiredAtRef.current = now;

    const myRequestId = ++requestIdRef.current;

    setView('analyzing');

    if (!hasKey) {
      if (myRequestId === requestIdRef.current) setView('no-key');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZING_TIMEOUT_MS);

    try {
      const [workoutsRes, prsRes, whoopRes] = await Promise.allSettled([
        getWorkouts(user.id, { limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        whoopService.fetchAll('day').catch(() => null),
      ]);
      const workouts = (workoutsRes.status === 'fulfilled' ? workoutsRes.value : []) as WorkoutWithExercises[];
      const prs = prsRes.status === 'fulfilled' ? prsRes.value : [];
      const whoopData = whoopRes.status === 'fulfilled' ? whoopRes.value : null;

      const systemPrompt = buildSystemPrompt(profile, workouts, prs, [] as FoodScan[], getRuns(), whoopData as any, parseSkincareStats(), 'insight');
      const userTurn = buildInsightPrompt(detail);

      // Thinking disabled: this is a short 2-3 sentence summary, not a
      // reasoning task, and thinking tokens count against the same
      // maxOutputTokens budget — skipping it keeps this fast and reliable.
      const buildBody = (targetModel: string) => ({
        model: targetModel,
        stream: false,
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      let res = await fetch('/api/ai-coach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(model)),
        signal: controller.signal,
      });
      if (!res.ok) {
        res = await fetch('/api/ai-coach/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(FALLBACK_MODEL)),
          signal: controller.signal,
        });
      }
      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => ({}));
        throw new Error(`Gemini request failed (${res.status}): ${(errBody as any)?.error?.message || 'unknown error'}`);
      }

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim().replace(/\*\*/g, '');
      if (!text) throw new Error(`Empty response — finishReason: ${data?.candidates?.[0]?.finishReason || 'unknown'}`);

      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;

      setMessage(text);
      startTyping(text);
    } catch (err) {
      console.warn('Post-workout AI insight failed, using fallback summary:', err);
      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;
      const firstName = (profile?.full_name || 'there').split(' ')[0];
      const fallback = buildFallbackInsight(detail, firstName);
      setMessage(fallback);
      startTyping(fallback);
    }
  }, [user?.id, profile, startTyping, hasKey, model]);
```

Note: the `no-key` guard now checks `hasKey` from the hook (populated asynchronously on mount) instead of a synchronous `localStorage.getItem`. Since `useAiCoachKey()` fetches on mount and this pill is mounted app-wide from `Layout.tsx`, `hasKey` will typically already be resolved by the time a workout finishes (a multi-minute session) — if it's still `null` (not yet loaded) at the moment `runInsight` fires, `!hasKey` is `true` for `null` too, so it falls into the same `no-key` UI state, which is the safe default (worst case: a very fast first workout shows "Set up AI Coach" once even though a key exists, self-corrects on the next workout once the hook has loaded).

- [ ] **Step 3: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (baseline, no new errors).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual test**

Finish a workout end-to-end (with a Gemini key configured for the test user):
- Verify "Analyzing…" → real AI insight text appears (typewriter reveal, unchanged UX).
- Temporarily remove the key in Settings, finish another workout → verify the "Set up AI Coach for workout insights" bar appears instead of a silent failure.
- Re-add the key, finish a workout with the network throttled/offline briefly to force a timeout → verify the deterministic fallback summary (`buildFallbackInsight`) still appears instead of the bar vanishing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/PostWorkoutCoachPill.tsx
git commit -m "PostWorkoutCoachPill: route insight generation through the server proxy"
```

---

### Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck, both scopes**

```bash
npx tsc --noEmit
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
```
Expected: root clean; src count is `23` (10 pre-existing errors, none new).

- [ ] **Step 2: Full build**

```bash
npm run build
```
Expected: both the Next.js build and the legacy Vite build (`build:legacy`, run automatically as part of `npm run build`) succeed.

- [ ] **Step 3: End-to-end manual QA checklist**

With a fresh test user (no Gemini key) and `npm run dev`:
- [ ] Opening AI Coach with no key shows the setup modal; opening the post-workout pill after a workout with no key shows "Set up AI Coach for workout insights".
- [ ] Entering an invalid key shows an inline error, nothing is saved (`GET /api/ai-coach/keys` still returns `hasKey: false`).
- [ ] Entering a valid key succeeds; `GET /api/ai-coach/keys` now returns `hasKey: true`.
- [ ] A chat message streams incrementally in the UI.
- [ ] A logging tool call ("log 80kg") still round-trips correctly.
- [ ] Naming an exercise with no sets/reps still shows the inline exercise form.
- [ ] Finishing a workout produces a real AI insight (or the deterministic fallback on a forced failure) — never a silent vanish.
- [ ] Settings → "Remove key" clears server-side state; AI Coach immediately requires setup again.
- [ ] With an old `localStorage['athlix:gemini_api_key']` value manually set (simulating a pre-migration user) and no Supabase row, loading Settings (or opening AI Coach) silently migrates it — `localStorage` is cleared and `GET /api/ai-coach/keys` reports `hasKey: true` without the user re-entering anything.

- [ ] **Step 4: Update CLAUDE.md if any new conventions were introduced**

Check whether `CLAUDE.md`'s "AI Coach" section (under Features Reference) needs a line noting the new `/api/ai-coach/*` proxy layer, since future work on this feature will need to know it exists. If so, add one or two lines there.

- [ ] **Step 5: Final commit (if Step 4 produced changes)**

```bash
git add CLAUDE.md
git commit -m "Document the AI Coach server-side proxy in CLAUDE.md"
```
