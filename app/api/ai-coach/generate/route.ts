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
// fallback. Configured with a single shared server key.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

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
    .select('gemini_api_key')
    .eq('user_id', user.id)
    .maybeSingle();

  const { model, stream, ...body } = await req.json();

  // ── Groq (primary) — text-only. Image requests (food scanner) skip to Gemini
  // since Groq's text models can't see images.
  if (GROQ_API_KEY && !containsImage(body.contents)) {
    const groqBody: Record<string, unknown> = { ...translateToGroq(body, GROQ_MODEL), stream: !!stream };
    if (stream) groqBody.stream_options = { include_usage: true };

    // Retry transient failures (rate-limit / TPM / 5xx) with backoff before
    // giving up — this is what made "some chats work, some don't".
    let groqErr: { status: number; message: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gres = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify(groqBody),
        });

        if (gres.ok && gres.body) {
          if (stream) return new Response(groqStreamToGemini(gres.body), { status: 200, headers: SSE_HEADERS });
          return NextResponse.json(groqToGeminiResponse(await gres.json()));
        }

        const eb = await gres.json().catch(() => ({}));
        groqErr = { status: gres.status, message: eb?.error?.message || `Groq error ${gres.status}` };
        const transient = gres.status === 429 || gres.status >= 500;
        if (transient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        break; // non-transient (e.g. 400 bad request) → don't retry
      } catch (e) {
        groqErr = { status: 502, message: e instanceof Error ? e.message : 'Groq request failed' };
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
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
      { error: { code: 'NO_KEY', message: 'No AI provider available. Set GROQ_API_KEY on the server, or add a Gemini key in Settings.' } },
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
