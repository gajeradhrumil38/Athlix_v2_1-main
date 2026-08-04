import { supabase } from './supabase';

// fetch() wrapper for the AI-Coach API routes that attaches the current
// Supabase access token as a Bearer header. The SPA's browser client keeps a
// fresh (auto-refreshed) token in memory, so this is far more reliable than
// letting the Next.js route read the session cookie — which the iframe +
// dual-refresh setup was intermittently failing to see, causing the coach to
// think a stored Gemini key was missing and re-prompt for it. The route still
// falls back to the cookie if no header is present.
export async function aiCoachFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch { /* no session — send without a header, route will 401 cleanly */ }

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
