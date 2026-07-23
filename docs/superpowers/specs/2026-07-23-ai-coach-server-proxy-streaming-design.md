# AI Coach Server-Side Proxy + Streaming — Design

**Status:** Approved by user, 2026-07-23. Ready for implementation planning.

## Problem

`AiChat.tsx` and `PostWorkoutCoachPill.tsx` both call `generativelanguage.googleapis.com` directly from the browser:

- The user's Gemini API key is read from `localStorage` and sent as a URL query parameter (`?key=${apiKey}`) on every request — URL params are more prone to leaking via proxy/CDN logs and browser history than a header would be.
- The key lives only in `localStorage`, so it doesn't follow the user across devices and isn't recoverable if browser storage is cleared.
- Responses are not streamed. `AiChat.tsx` waits for Gemini's full `generateContent` response, then fakes a typing effect with a client-side `setInterval` reveal (`typeTimerRef` / `TYPE_CHAR_MS`). Real chat products stream tokens as they're generated.
- There is no server-side observability or rate-limiting on Gemini usage — only a client-side `localStorage` token-usage counter (`trackTokenUsage` in `AiChat.tsx`) that's purely informational.

## Research grounding

- Production LLM proxies (LiteLLM, Gravitee, and this repo's own `supabase/functions/whoop-oauth`) keep the provider key server-side and forward validated requests, rather than sending secrets from the browser.
- Chat UI best practice for 2026 is token-by-token streaming with a visible in-progress state, not a blocking spinner followed by a simulated typewriter.
- This repo already has the exact bridge needed for a Next.js-based proxy: `src/lib/supabase.ts`'s browser client deliberately uses `createBrowserClient` from `@supabase/ssr`, which stores the session in **cookies** (not localStorage) specifically so Next.js route handlers can read the same session (see the comment at `src/lib/supabase.ts:23-27`, and the proven pattern at `app/api/protected/route.ts` using `createRouteHandlerSupabaseClient()`).

## Non-goals

- **Not** migrating to the Vercel AI SDK's abstraction layer (`ai` / `@ai-sdk/google`). The existing hand-rolled Gemini REST integration — 9 tool declarations, the `executeTool` dispatcher, retry + fallback-model logic, `thinkingConfig` tuning — was carefully debugged across this session's earlier fixes. Translating it into the SDK's own tool-calling shape is a large, risky rewrite for no functional gain right now. The request/response JSON shape sent to Gemini stays exactly as it is today; only *where* the fetch happens changes.
- **Not** building conversation persistence, session history UI, or server-side rate-limiting/observability dashboards in this phase. Those are separate, independently-scoped follow-ups (flagged during brainstorming, deliberately deferred).
- **Not** changing the tool-calling contract, system-prompt content, or `buildSystemPrompt` variants (`'chat'` / `'insight'`) — those are unrelated to the transport layer.

## Architecture

```
Browser (AiChat.tsx / PostWorkoutCoachPill.tsx)
   │  POST /api/ai-coach/generate
   │  { systemPrompt, contents, tools?, model, stream }
   ▼
Next.js Route Handler (app/api/ai-coach/generate/route.ts)
   │  1. createRouteHandlerSupabaseClient() → auth.getUser() (401 if none)
   │  2. look up user's Gemini key from ai_coach_keys by user.id (400 "no key" if none)
   │  3. forward the exact payload to Gemini:
   │       - stream:true  → POST .../{model}:streamGenerateContent?alt=sse (key in header)
   │       - stream:false → POST .../{model}:generateContent (key in header)
   │  4. pipe Gemini's response back to the client
   │       - stream:true  → pipe the SSE ReadableStream straight through
   │       - stream:false → return the parsed JSON body
   ▼
generativelanguage.googleapis.com
```

The API key is sent to Gemini via the `x-goog-api-key` header (Gemini's REST API supports this as an alternative to the `?key=` query param), never via URL, and never returned to the browser.

## Data model

New table `ai_coach_keys`, mirroring the *owner-writes-their-own-row* pattern already used for settings like `rest_timer_preferences` (not the locked-down `whoop_tokens` pattern, since this key is user-typed in Settings rather than issued via an OAuth callback the client doesn't control):

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

**Migration from `localStorage`:** on Settings page load, if `localStorage['athlix:gemini_api_key']` has a value and no `ai_coach_keys` row exists for the user yet, write it to Supabase, then clear the `localStorage` key. One-time, silent, no user action required. `GEMINI_MODEL_STORAGE` migrates the same way into the `model` column.

## API surface

**`POST /api/ai-coach/generate`**

Request body (constructed client-side exactly as today's Gemini request body is, just without the key):
```json
{
  "systemPrompt": "string",
  "contents": [{ "role": "user" | "model", "parts": [...] }],
  "tools": [{ "function_declarations": [...] }],
  "model": "gemini-2.5-flash",
  "generationConfig": { "temperature": 1, "maxOutputTokens": 2048, "thinkingConfig": {...} },
  "stream": true
}
```

Response:
- `stream: true` → `Content-Type: text/event-stream`, Gemini's own SSE framing piped through unmodified. Client parses the same `data: {...}` chunks Gemini emits.
- `stream: false` → `Content-Type: application/json`, Gemini's `generateContent` response body passed through unmodified.
- Errors → `{ "error": { "code": "NO_KEY" | "UPSTREAM_ERROR" | "UNAUTHORIZED", "message": "..." } }` with matching HTTP status (401 / 400 / 502), so the client's existing error-message extraction (`QUOTA:`, `INVALID_KEY:` prefixes etc. in `AiChat.tsx`) keeps working with minimal changes.

## Client changes

- **`AiChat.tsx`**: `fetchWithRetry` targets `/api/ai-coach/generate` instead of `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, with `stream: true`. Replace the "wait for full response → `setInterval` fake-type" flow with real incremental rendering: read the SSE stream, append each chunk's text to the in-progress message as it arrives. This also directly shrinks the empty-response/timeout failure class from this session's earlier bugs — the user sees tokens the moment generation starts instead of waiting blind for the whole response.
- **`PostWorkoutCoachPill.tsx`**: same endpoint, `stream: false` — its typewriter reveal (`startTyping`) is a deliberate branded effect already tuned for the collapsed-bar UI, not a streaming simulation to be replaced. The `AbortController` timeout and `buildFallbackInsight` deterministic fallback added in the last fix are transport-agnostic and stay exactly as-is; the abort now cancels the fetch to `/api/ai-coach/generate` instead of directly to Gemini.
- **`Settings.tsx`** (or wherever the Gemini key field lives): save/load through the new Supabase-backed CRUD instead of `localStorage`, plus the one-time migration described above.
- Tool-calling flow (`executeTool`, `FUNCTION_DECLARATIONS`, the two-step function-call → function-response round trip) is unchanged — it already operates on `contents` and Gemini response `parts`, which keep the same shape through the proxy.

## Error handling

- No key configured → route handler returns `401 { error: { code: "NO_KEY" } }`; client shows the same "Set up AI Coach" prompt it shows today for a missing `localStorage` key.
- Gemini upstream error (quota, invalid key, overload) → route handler passes Gemini's own error message through inside `UPSTREAM_ERROR`, preserving the client's existing `QUOTA:` / `INVALID_KEY:` / overload-retry detection logic.
- Network/timeout on the proxy call itself → same `AbortController` + retry/fallback-model logic already in both client files, just re-pointed at the new endpoint.

## Testing plan

- `npx tsc -p src/tsconfig.json --noEmit` — confirm no new errors against the existing 10-error pre-existing baseline.
- `npm run build` — confirm the Next.js route handler compiles and the legacy Vite build still succeeds.
- Manual verification (this app has no automated test suite — `npm test` is a no-op placeholder):
  - Fresh user with no key → prompted to set one up, in both `AiChat` and the post-workout pill.
  - Existing user with a `localStorage` key → silently migrated to Supabase on next Settings visit; subsequent chat calls succeed without re-entering the key.
  - A real chat message streams incrementally in the UI (not a single jump from empty to full text).
  - A tool-calling message (e.g. "log 80kg") still round-trips correctly through the two-step function-call flow.
  - Finishing a workout still produces a post-workout insight (or the deterministic fallback) through the non-streaming path.
  - Invalid/expired key produces the same user-facing error copy as before.
