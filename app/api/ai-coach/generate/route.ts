import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/apiAuth';
import { GROQ_URL, containsImage, translateToGroq, groqToGeminiResponse, groqStreamToGemini } from '@/lib/groqBridge';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Flash-Lite: highest free-tier daily quota (~1,000 req/day). Any non-current
// model the client might still send (low-quota, retired, or a dead preview
// snapshot like gemini-2.5-flash-preview-05-20) is coerced to a valid one so
// the Gemini fallback never 404s on a stale model.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const ALLOWED_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-pro']);

// Groq is primary (much larger free daily quota, very fast); Gemini is the
// fallback. Each user can save their own Groq key (own quota, no shared-key
// rate-limit); otherwise a shared server key pool is used.
//
// GROQ_API_KEY may be a single key OR a comma-separated pool. TPM rate limits
// are per-account, so rotating across several shared keys multiplies the free
// ceiling for the whole user base — the pragmatic stand-in for per-user keys
// (Groq has no public API to mint one key per user). Order is preserved; the
// first key is tried first, so a single-key deployment behaves exactly as before.
const SHARED_GROQ_KEYS = (process.env.GROQ_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);
// Model ladder: try the best model first, and on a rate-limit (429) or 5xx drop
// to the next — so we use quality when there's TPM headroom and never hit the
// wall. Primary openai/gpt-oss-120b (flagship open-weight, 131K ctx), fallback
// openai/gpt-oss-20b (much faster/cheaper, larger TPM headroom). These are
// Groq's PRODUCTION models — they replaced the retired llama-3.3-70b-versatile
// / llama-3.1-8b-instant, decommissioned 2026-08-16. Both overridable via env;
// qwen/qwen3.6-27b is a preview-only alternative (avoid as a default).
const GROQ_MODELS = Array.from(new Set([
  process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b',
]));

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

export async function POST(req: NextRequest) {
  const { user, supabase } = await resolveApiUser(req);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { data: keyRow } = await supabase
    .from('ai_coach_keys')
    .select('gemini_api_key, groq_api_key')
    .eq('user_id', user.id)
    .maybeSingle();

  // The user's own Groq key wins over the shared pool (own quota, no shared-key
  // rate-limit). Then the shared pool is rotated so one account's TPM ceiling
  // isn't the whole app's ceiling. Deduped, in priority order.
  const groqKeys = Array.from(new Set([keyRow?.groq_api_key, ...SHARED_GROQ_KEYS].filter(Boolean) as string[]));

  const { model, stream, ...body } = await req.json();

  // ── Groq (primary) — text-only. Image requests (food scanner) skip to Gemini
  // since Groq's text models can't see images.
  if (groqKeys.length && !containsImage(body.contents)) {
    // Rotate over (key × model). On a 429 (TPM/rate-limit) or 5xx, move on to
    // the next model, then the next KEY — a different account has a fresh quota,
    // which is the highest-value move for a rate limit. A retired model is
    // skipped (Groq rotates them). A genuine 4xx (bad request) stops everything.
    // First OK response wins (stream starts only after a 200).
    let groqErr: { status: number; message: string } | null = null;
    let rateLimited = false;
    let retryAfter = 0; // seconds Groq asked us to wait, if any
    let badRequest = false;

    outer:
    for (const groqKey of groqKeys) {
      for (const gmodel of GROQ_MODELS) {
        const groqBody: Record<string, unknown> = { ...translateToGroq(body, gmodel), stream: !!stream };
        if (stream) groqBody.stream_options = { include_usage: true };
        try {
          const gres = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
            body: JSON.stringify(groqBody),
          });

          if (gres.ok && gres.body) {
            if (stream) return new Response(groqStreamToGemini(gres.body), { status: 200, headers: SSE_HEADERS });
            return NextResponse.json(groqToGeminiResponse(await gres.json()));
          }

          const eb = await gres.json().catch(() => ({}));
          groqErr = { status: gres.status, message: eb?.error?.message || `Groq error ${gres.status}` };

          if (gres.status === 429) {
            rateLimited = true;
            // Honor Groq's own backoff hint (header or body) so the client can
            // wait exactly long enough — no more, no less.
            const hdr = Number(gres.headers.get('retry-after'));
            const m = /try again in ([\d.]+)s/i.exec(groqErr.message);
            const secs = Number.isFinite(hdr) && hdr > 0 ? hdr : m ? Math.ceil(Number(m[1])) : 0;
            if (secs > retryAfter) retryAfter = secs;
            continue; // next model, then next key
          }
          if (gres.status >= 500) continue; // transient upstream → next model/key
          // A missing/inaccessible/retired model must NOT kill the request —
          // Groq rotates models, so fall through. Only a genuine bad request stops.
          const modelUnavailable =
            gres.status === 404 ||
            eb?.error?.code === 'model_not_found' ||
            eb?.error?.code === 'model_decommissioned' ||
            /does not exist|do not have access|model_not_found|decommission|deprecat|no longer|unavailable/i.test(groqErr.message);
          if (modelUnavailable) continue;
          badRequest = true;
          break outer; // genuine 4xx bad request → don't try other models/keys
        } catch (e) {
          groqErr = { status: 502, message: e instanceof Error ? e.message : 'Groq request failed' };
          continue; // network blip → try the next model/key
        }
      }
    }

    // Groq failed. Prefer the Gemini fallback if the user has a key; otherwise
    // surface a diagnosable, actionable error. A rate limit is distinct from a
    // hard failure: it carries RATE_LIMITED + retry_after so the client can
    // auto-retry silently instead of dead-ending on "coach is busy".
    if (!keyRow?.gemini_api_key && groqErr) {
      if (rateLimited && !badRequest) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'The coach is at its shared free-tier limit right now.', retry_after: retryAfter || undefined } },
          { status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : undefined },
        );
      }
      return NextResponse.json(
        { error: { code: 'PROVIDER_ERROR', message: `Coach service error — ${groqErr.message}` } },
        { status: 502 },
      );
    }
  }

  // ── Gemini (fallback) — needs the user's own key.
  if (!keyRow?.gemini_api_key) {
    return NextResponse.json(
      { error: { code: 'NO_KEY', message: 'No AI provider available. Add a Groq API key in Settings (recommended), or a Gemini key.' } },
      { status: 400 },
    );
  }

  const requested = (typeof model === 'string' && model) || DEFAULT_MODEL;
  const targetModel = ALLOWED_MODELS.has(requested) ? requested : DEFAULT_MODEL;

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
    // client's existing status/message-based retry logic keeps working.
    const errBody = await upstream.json().catch(() => ({}));
    return NextResponse.json(errBody, { status: upstream.status });
  }

  if (stream) {
    return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
