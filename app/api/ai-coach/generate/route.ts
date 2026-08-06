import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/apiAuth';
import { GROQ_URL, containsImage, translateToGroq, groqToGeminiResponse, groqStreamToGemini } from '@/lib/groqBridge';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Flash-Lite: highest free-tier daily quota (~1,000 req/day). Retired/low-quota
// models the client might still send are coerced here as a safety net.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const LOW_QUOTA_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest']);

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
    try {
      const groqBody: Record<string, unknown> = { ...translateToGroq(body, GROQ_MODEL), stream: !!stream };
      if (stream) groqBody.stream_options = { include_usage: true };

      const gres = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify(groqBody),
      });

      if (gres.ok && gres.body) {
        if (stream) return new Response(groqStreamToGemini(gres.body), { status: 200, headers: SSE_HEADERS });
        const gjson = await gres.json();
        return NextResponse.json(groqToGeminiResponse(gjson));
      }
      // Not ok → fall through to Gemini.
    } catch {
      // Network/parse error → fall through to Gemini.
    }
  }

  // ── Gemini (fallback) — needs the user's own key.
  if (!keyRow?.gemini_api_key) {
    return NextResponse.json(
      { error: { code: 'NO_KEY', message: 'No AI provider available. Add a Gemini key in Settings, or set GROQ_API_KEY on the server.' } },
      { status: 400 },
    );
  }

  const requested = (typeof model === 'string' && model) || DEFAULT_MODEL;
  const targetModel = LOW_QUOTA_MODELS.has(requested) ? DEFAULT_MODEL : requested;

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
