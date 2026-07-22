import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_SUPABASE_URL = 'https://mrntwydykqsdawpklumf.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h8Mv7ku_c2I9XIS1tzarYQ_ozj9Dkxw';
type OtpType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email';

const isOtpType = (value: string): value is OtpType =>
  [
    'signup',
    'invite',
    'magiclink',
    'recovery',
    'email_change',
    'email',
  ].includes(value);

const getSafeNextPath = (value: string | null) => {
  if (!value) return '/dashboard';
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code      = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type      = requestUrl.searchParams.get('type');
  const next      = getSafeNextPath(requestUrl.searchParams.get('next'));
  const hasAuthError =
    Boolean(requestUrl.searchParams.get('error')) ||
    Boolean(requestUrl.searchParams.get('error_code'));

  if (hasAuthError) {
    return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  // Collect cookies that Supabase sets during the exchange so we can
  // forward them to the redirect response. Using NextResponse.next() as
  // the carrier ensures they aren't silently dropped on the redirect.
  const cookiesToForward: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => cookiesToForward.push(c));
      },
    },
  });

  // ── PKCE code exchange (implicit-flow reset emails produce token_hash,
  //    but keep this branch for OAuth and email-confirmation codes) ────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
    }

    const destination = type === 'recovery' ? '/reset-password' : next;
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    cookiesToForward.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
    });
    return redirectResponse;
  }

  // ── OTP / token_hash (password-reset implicit flow, magic links) ─────────
  if (tokenHash && type && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
    }

    const destination = type === 'recovery' ? '/reset-password' : next;
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    cookiesToForward.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
    });
    return redirectResponse;
  }

  // No recognised params — go home
  return NextResponse.redirect(new URL('/login', request.url));
}
