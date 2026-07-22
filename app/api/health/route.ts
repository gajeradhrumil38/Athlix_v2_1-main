import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';

export const runtime = 'edge';
const DEFAULT_SUPABASE_URL = 'https://mrntwydykqsdawpklumf.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h8Mv7ku_c2I9XIS1tzarYQ_ozj9Dkxw';

export async function GET() {
  const includeDebugDetails = process.env.NODE_ENV !== 'production';
  const resolvedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const resolvedPublicKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  const debugEnv = {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasResolvedUrl: Boolean(resolvedUrl),
    hasPublicKey: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    hasResolvedPublicKey: Boolean(resolvedPublicKey),
  };

  if (!debugEnv.hasResolvedUrl || !debugEnv.hasResolvedPublicKey) {
    return NextResponse.json(
      {
        ok: false,
        issue: 'Missing required Supabase environment variables.',
        ...(includeDebugDetails ? { debug: { env: debugEnv } } : {}),
        ts: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const { error: profileQueryError } = await supabase.from('profiles').select('id').limit(1);

    return NextResponse.json({
      ok: !authError && !profileQueryError,
      service: 'athlix-next',
      ...(includeDebugDetails
        ? {
            debug: {
              env: debugEnv,
              authError: authError?.message ?? null,
              profileQueryError: profileQueryError?.message ?? null,
              authenticatedUserId: user?.id ?? null,
            },
          }
        : {}),
      ts: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        issue: error?.message || 'Supabase health check failed.',
        ...(includeDebugDetails ? { debug: { env: debugEnv } } : {}),
        ts: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
