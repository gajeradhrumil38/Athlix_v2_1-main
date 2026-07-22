// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('WHOOP_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/whoop-oauth`;
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const PROFILE_URL = 'https://api.prod.whoop.com/developer/v2/user/profile/basic';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

// Server-side cache TTL: day tab 15 min, range tabs 60 min
const CACHE_TTL_DAY_MS = 15 * 60 * 1000;
const CACHE_TTL_RANGE_MS = 60 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function resolveToken(sb: any, userId: string): Promise<string | null> {
  const { data: row } = await sb
    .from('whoop_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', userId)
    .single();

  if (!row) return null;

  let accessToken = row.access_token as string;
  const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : Infinity;

  if (Date.now() >= expiresAt - 5 * 60 * 1000 && row.refresh_token) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token as string,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (res.ok) {
      const t = await res.json() as any;
      accessToken = t.access_token;
      await sb.from('whoop_tokens').upsert({
        user_id: userId,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? row.refresh_token,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      });
    }
  }

  return accessToken;
}

async function whoopGet(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return { records: [], next_token: null };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WHOOP API ${res.status}: ${text || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── POST: action-based handler ─────────────────────────────
  if (req.method === 'POST') {
    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }

    const action = (body.action as string) ?? 'refresh';
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const jwt = auth.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // ── refresh ────────────────────────────────────────────────
    if (action === 'refresh') {
      const { data: row } = await sb
        .from('whoop_tokens')
        .select('refresh_token')
        .eq('user_id', user.id)
        .single();

      if (!row?.refresh_token) return json({ error: 'Not connected' }, 404);

      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: row.refresh_token as string,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) return json({ error: 'Token refresh failed' }, 400);

      const t = await tokenRes.json() as any;
      const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();

      await sb.from('whoop_tokens').upsert({
        user_id: user.id,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? row.refresh_token,
        expires_at: expiresAt,
      });

      return json({ access_token: t.access_token, expires_at: expiresAt });
    }

    // ── fetch_all: single batched call with server-side DB caching ──
    if (action === 'fetch_all') {
      const tab = (body.tab as string) ?? 'day';
      const startDate = body.start as string | undefined;
      const endDate = body.end as string | undefined;

      const cacheTtl = tab === 'day' ? CACHE_TTL_DAY_MS : CACHE_TTL_RANGE_MS;
      const suffix = tab === 'day' ? 'latest' : `${startDate}:${endDate}`;
      const cacheKeys = [`recovery:${suffix}`, `sleep:${suffix}`, `cycles:${suffix}`, `workouts:${suffix}`];

      // Check DB cache for all three keys at once
      const { data: cachedRows } = await sb
        .from('whoop_cache')
        .select('cache_key, data, fetched_at')
        .eq('user_id', user.id)
        .in('cache_key', cacheKeys);

      const now = Date.now();
      const freshData = new Map<string, any>();
      const staleKeys: string[] = [];

      for (const key of cacheKeys) {
        const row = (cachedRows ?? []).find((r: any) => r.cache_key === key);
        if (row && now - new Date(row.fetched_at as string).getTime() < cacheTtl) {
          freshData.set(key, row.data);
        } else {
          staleKeys.push(key);
        }
      }

      // Only hit WHOOP for stale keys
      if (staleKeys.length > 0) {
        const accessToken = await resolveToken(sb, user.id);
        if (!accessToken) return json({ error: 'Not connected' }, 404);

        const paths: Record<string, string> = {
          [`recovery:${suffix}`]: tab === 'day'
            ? '/v2/recovery?limit=10'
            : `/v2/recovery?start=${startDate}&end=${endDate}&limit=25`,
          [`sleep:${suffix}`]: tab === 'day'
            ? '/v2/activity/sleep?limit=10'
            : `/v2/activity/sleep?start=${startDate}&end=${endDate}&limit=25`,
          [`cycles:${suffix}`]: tab === 'day'
            ? '/v2/cycle?limit=5'
            : `/v2/cycle?start=${startDate}&end=${endDate}&limit=25`,
          [`workouts:${suffix}`]: tab === 'day'
            ? '/v2/activity/workout?limit=10'
            : `/v2/activity/workout?start=${startDate}&end=${endDate}&limit=25`,
        };

        await Promise.all(staleKeys.map(async (key) => {
          const data = await whoopGet(accessToken, paths[key]);
          freshData.set(key, data);
          // Fire-and-forget cache write — don't block response
          sb.from('whoop_cache').upsert({
            user_id: user.id,
            cache_key: key,
            data,
            fetched_at: new Date().toISOString(),
          }).then(() => {/* ignore */}).catch(() => {/* ignore */});
        }));
      }

      return json({
        recovery: freshData.get(`recovery:${suffix}`) ?? { records: [] },
        sleep: freshData.get(`sleep:${suffix}`) ?? { records: [] },
        cycles: freshData.get(`cycles:${suffix}`) ?? { records: [] },
        workouts: freshData.get(`workouts:${suffix}`) ?? { records: [] },
        from_cache: staleKeys.length === 0,
      });
    }

    // ── fetch: legacy single-path proxy (kept for backwards compat) ──
    if (action === 'fetch') {
      const path = body.path as string;
      if (!path) return json({ error: 'Missing path' }, 400);

      const accessToken = await resolveToken(sb, user.id);
      if (!accessToken) return json({ error: 'Not connected' }, 404);

      const whoopRes = await fetch(`${WHOOP_API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (whoopRes.status === 404) {
        return json({ records: [], next_token: null, values: [] });
      }

      const data = await whoopRes.json().catch(() => ({}));
      return json(data, whoopRes.status);
    }

    // ── store_token: validate and store a manually pasted access token ──
    if (action === 'store_token') {
      const token = body.token as string;
      if (!token) return json({ error: 'Missing token' }, 400);

      // Validate token server-side (avoids CORS restrictions in browser)
      const profileRes = await fetch(PROFILE_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profileRes.ok) {
        const text = await profileRes.text().catch(() => '');
        return json({ error: text || 'Invalid or expired WHOOP token' }, 401);
      }

      const profile = await profileRes.json().catch(() => ({})) as any;

      const { error: dbErr } = await sb.from('whoop_tokens').upsert({
        user_id: user.id,
        access_token: token,
        refresh_token: '',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        whoop_user_id: profile.user_id ?? null,
      });

      if (dbErr) return json({ error: 'Failed to save token' }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  }

  // ── GET: OAuth callback from WHOOP ─────────────────────────
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const oauthErrorDesc = url.searchParams.get('error_description');

  let returnUrl = '';
  let userId = '';

  try {
    const decoded = JSON.parse(atob(state ?? '')) as { userId: string; returnUrl: string };
    returnUrl = decoded.returnUrl ?? '';
    userId = decoded.userId ?? '';
  } catch {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  const errorRedirect = (msg: string) => {
    const u = new URL(returnUrl);
    u.hash = u.hash + '?whoop=error&msg=' + encodeURIComponent(msg);
    return Response.redirect(u.href, 302);
  };

  if (oauthError || !code) {
    return errorRedirect(oauthErrorDesc ?? oauthError ?? 'OAuth cancelled');
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return errorRedirect(`Token exchange failed: ${text}`);
  }

  const tokens = await tokenRes.json() as any;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const profileRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = await profileRes.json().catch(() => ({})) as any;

  const { error: dbErr } = await sb.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    whoop_user_id: profile.user_id ?? null,
  });

  if (dbErr) return errorRedirect('Failed to save connection');

  const successUrl = new URL(returnUrl);
  successUrl.hash = successUrl.hash + '?whoop=connected';
  return Response.redirect(successUrl.href, 302);
});
