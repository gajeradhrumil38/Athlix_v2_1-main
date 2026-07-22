import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Backwards-compatible alias:
 * `/auth/confirm` now forwards to `/auth/callback` so all OTP/PKCE logic
 * runs through a single route handler.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL('/auth/callback', request.url);

  requestUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(callbackUrl);
}
