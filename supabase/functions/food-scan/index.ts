// Supabase Edge Function — FatSecret API proxy
// Keeps Consumer Key + Secret server-side; handles OAuth 1.0a signing with Web Crypto.
// Called via supabase.functions.invoke('food-scan', { body: { action, ... } })

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const JSON_CT = { ...CORS, 'Content-Type': 'application/json' };

const FS_URL = 'https://platform.fatsecret.com/rest/server.api';

// ─── OAuth 1.0a helpers (Web Crypto / Deno) ───────────────────────────────

function nonce(len = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function signedParams(
  methodParams: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
): Promise<Record<string, string>> {
  const base: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
    oauth_version:          '1.0',
    ...methodParams,
  };

  // Signature base string
  const paramStr = Object.keys(base)
    .sort()
    .map((k) => `${pct(k)}=${pct(base[k])}`)
    .join('&');
  const baseString = `POST&${pct(FS_URL)}&${pct(paramStr)}`;
  const signingKey  = `${pct(consumerSecret)}&`; // No token secret (2-legged)

  const sig = await hmacSha1Base64(signingKey, baseString);
  return { ...base, oauth_signature: sig };
}

async function callFatSecret(
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
): Promise<unknown> {
  const all = await signedParams(params, consumerKey, consumerSecret);
  const body = Object.entries(all)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const res = await fetch(FS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`FatSecret ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FatSecret non-JSON response: ${text}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Auth guard
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_CT });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_CT });
  }

  const consumerKey    = Deno.env.get('FATSECRET_CONSUMER_KEY');
  const consumerSecret = Deno.env.get('FATSECRET_CONSUMER_SECRET');
  if (!consumerKey || !consumerSecret) {
    return new Response(
      JSON.stringify({ error: 'FatSecret credentials not configured on server.' }),
      { status: 500, headers: JSON_CT },
    );
  }

  let body: { action?: string; imageUrl?: string; query?: string; foodId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: JSON_CT });
  }

  try {
    let result: unknown;

    switch (body.action) {
      // ── Image recognition (FatSecret Premier plan required) ──────────────
      case 'recognize': {
        if (!body.imageUrl) {
          return new Response(JSON.stringify({ error: 'imageUrl required' }), { status: 400, headers: JSON_CT });
        }
        result = await callFatSecret({
          method:            'foods.recognize_v2',
          image_url:         body.imageUrl,
          format:            'json',
          include_food_data: 'true',
        }, consumerKey, consumerSecret);
        break;
      }

      // ── Text search ───────────────────────────────────────────────────────
      case 'search': {
        if (!body.query?.trim()) {
          return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers: JSON_CT });
        }
        result = await callFatSecret({
          method:            'foods.search',
          search_expression: body.query.trim(),
          format:            'json',
          max_results:       '15',
          page_number:       '0',
        }, consumerKey, consumerSecret);
        break;
      }

      // ── Single food lookup ────────────────────────────────────────────────
      case 'get_food': {
        if (!body.foodId) {
          return new Response(JSON.stringify({ error: 'foodId required' }), { status: 400, headers: JSON_CT });
        }
        result = await callFatSecret({
          method:  'food.get.v4',
          food_id: body.foodId,
          format:  'json',
        }, consumerKey, consumerSecret);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${body.action}` }),
          { status: 400, headers: JSON_CT },
        );
    }

    return new Response(JSON.stringify(result), { headers: JSON_CT });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[food-scan]', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: JSON_CT });
  }
});
