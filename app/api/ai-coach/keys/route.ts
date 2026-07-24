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
