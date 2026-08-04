import { NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient, createAccessTokenClient } from './supabase';

// Resolve the signed-in user from EITHER a Bearer access token (preferred —
// the SPA sends the fresh token it holds in memory) OR the session cookie
// (fallback). The Bearer path sidesteps the cookie/refresh race that made
// cookie-only auth intermittently 401 on load, which was making the AI Coach
// think a stored Gemini key was missing and re-prompt for it every visit.
//
// Returns a supabase client scoped to that user (RLS-enforced) either way, so
// callers just use `supabase` for their query regardless of how auth resolved.
export async function resolveApiUser(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (token) {
    const supabase = createAccessTokenClient(token);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) return { user, supabase };
  }

  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user: user ?? null, supabase };
}
