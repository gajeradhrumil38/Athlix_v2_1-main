import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/apiAuth';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Flash-Lite: highest free-tier daily quota (~1,000 req/day). Retired/low-quota
// models the client might still send are coerced here as a safety net.
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const LOW_QUOTA_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest']);

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

  if (!keyRow?.gemini_api_key) {
    return NextResponse.json({ error: { code: 'NO_KEY', message: 'No Gemini API key configured.' } }, { status: 400 });
  }

  const { model, stream, ...body } = await req.json();
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
