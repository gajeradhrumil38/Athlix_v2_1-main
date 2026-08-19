import { NextRequest, NextResponse } from 'next/server';
import { resolveApiUser } from '@/lib/apiAuth';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

export async function GET(req: NextRequest) {
  const { user, supabase } = await resolveApiUser(req);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { data: row } = await supabase
    .from('ai_coach_keys')
    .select('model, gemini_api_key, groq_api_key')
    .eq('user_id', user.id)
    .maybeSingle();

  const hasGeminiKey = !!row?.gemini_api_key;
  const hasGroqKey = !!row?.groq_api_key;
  // The coach is usable if the user has any personal key OR a shared Groq key is
  // configured server-side.
  const groqAvailable = hasGroqKey || !!process.env.GROQ_API_KEY;
  return NextResponse.json({
    hasKey: hasGeminiKey || groqAvailable,
    hasGeminiKey,
    hasGroqKey,
    groqAvailable,
    model: row?.model || DEFAULT_MODEL,
  });
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await resolveApiUser(req);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { apiKey, groqApiKey, model } = await req.json();
  const trimmed = (typeof apiKey === 'string' ? apiKey : '').trim();
  const trimmedGroq = (typeof groqApiKey === 'string' ? groqApiKey : '').trim();
  const targetModel = (typeof model === 'string' && model) || DEFAULT_MODEL;

  // ── Groq key path ── validate against Groq, then persist. Groq is the coach's
  // primary provider, so this is all a user needs to enable it.
  if (trimmedGroq) {
    // Probe with a live production model — a retired ID (e.g. the decommissioned
    // llama-3.3-70b-versatile) would fail key validation for perfectly valid keys.
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const probe = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${trimmedGroq}` },
      body: JSON.stringify({ model: groqModel, messages: [{ role: 'user', content: 'hi' }], max_completion_tokens: 1 }),
    });
    if (!probe.ok) {
      const eb = await probe.json().catch(() => ({}));
      const msg: string = eb?.error?.message || `Error ${probe.status}`;
      const friendly = probe.status === 401 ? 'Invalid Groq key — check and try again.' : msg;
      return NextResponse.json({ success: false, error: { message: friendly } }, { status: 400 });
    }
    const { error } = await supabase
      .from('ai_coach_keys')
      .upsert({ user_id: user.id, groq_api_key: trimmedGroq, model: targetModel, updated_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ success: false, error: { message: 'Could not save Groq key. Try again.' } }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (!trimmed) {
    // No new key submitted — allow a model-only change for a user who
    // already has a key saved (e.g. switching model in Settings), since
    // the raw key is never sent back to the client to re-submit here.
    const { data: existing } = await supabase
      .from('ai_coach_keys')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ success: false, error: { message: 'API key is required.' } }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('ai_coach_keys')
      .update({ model: targetModel, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ success: false, error: { message: 'Could not update model. Try again.' } }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Validate the key against Gemini before persisting it — same one-token
  // probe request the old client-side ApiKeySetupModal used to make.
  const validateRes = await fetch(`${GEMINI_BASE}/gemini-2.5-flash-lite:generateContent`, {
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

export async function DELETE(req: NextRequest) {
  const { user, supabase } = await resolveApiUser(req);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  await supabase.from('ai_coach_keys').delete().eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
