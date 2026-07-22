import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const DEFAULT_SUPABASE_URL = 'https://mrntwydykqsdawpklumf.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h8Mv7ku_c2I9XIS1tzarYQ_ozj9Dkxw';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getServerSupabaseEnv = () => {
  return {
    url: supabaseUrl,
    publicKey: supabasePublicKey,
  };
};

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  return createBrowserClient<Database>(url, key, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export const createBrowserSupabaseClient = createClient;

/**
 * A separate client used ONLY for resetPasswordForEmail.
 * Uses implicit flow (no PKCE) so the reset link contains a token_hash
 * instead of a code+verifier pair. This means the link works in any browser
 * or email client — not just the one that requested the reset.
 * (PKCE reset links fail when opened in a different browser/app because
 * the code_verifier cookie doesn't travel with the user.)
 */
export function createPasswordResetClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  return createBrowserClient<Database>(url, key, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createServerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const env = getServerSupabaseEnv();

  return createServerClient<Database>(env.url, env.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called during Server Component rendering, middleware handles refresh cookies.
        }
      },
    },
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export async function createRouteHandlerSupabaseClient() {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const env = getServerSupabaseEnv();

  return createServerClient<Database>(env.url, env.publicKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export function createServiceRoleSupabaseClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  const env = getServerSupabaseEnv();

  return createSupabaseAdminClient<Database>(env.url, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
