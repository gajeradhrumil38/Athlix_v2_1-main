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
// rate-limit); otherwise a single shared server key is used if present.
const SHARED_GROQ_KEY = process.env.GROQ_API_KEY;
// Model ladder: try the best model first, and on a rate-limit (429) or 5xx drop
// to the next — so we use quality when there's TPM headroom and never hit the
// wall. Primary llama-3.3-70b (better answers), fallback llama-3.1-8b-instant
// (much larger free TPM budget). Both overridable; on a paid tier set
// GROQ_MODEL=openai/gpt-oss-120b, etc.
const GROQ_MODELS = Array.from(new Set([
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant',
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

  // The user's own Groq key wins over the shared server key.
  const groqKey = keyRow?.groq_api_key || SHARED_GROQ_KEY;

  const { model, stream, ...body } = await req.json();

  // ── Groq (primary) — text-only. Image requests (food scanner) skip to Gemini
  // since Groq's text models can't see images.
  if (groqKey && !containsImage(body.contents)) {
    // Walk the model ladder. On a 429 (TPM/rate-limit) or 5xx, drop to the next
    // (smaller, higher-limit) model instead of retrying the SAME one — retrying
    // a 429 immediately just amplifies it. A clean 4xx (bad request) stops the
    // ladder. First OK response wins (stream starts only after a 200).
    let groqErr: { status: number; message: string } | null = null;
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
        if (gres.status === 429 || gres.status >= 500) continue; // try the next model
        break; // 4xx bad request → don't try other models
      } catch (e) {
        groqErr = { status: 502, message: e instanceof Error ? e.message : 'Groq request failed' };
        continue; // network blip → try the next model
      }
    }

    // Groq failed after retries. Prefer the Gemini fallback if there's a key;
    // otherwise surface Groq's REAL error (not a misleading "no key") so the
    // failure is diagnosable instead of silent.
    if (!keyRow?.gemini_api_key && groqErr) {
      return NextResponse.json(
        { error: { code: 'PROVIDER_ERROR', message: `Coach service error — ${groqErr.message}` } },
        { status: groqErr.status === 429 ? 429 : 502 },
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
