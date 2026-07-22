import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';
import {
  consumeRateLimit,
  getClientIp,
  normalizeEmailForLimit,
} from '@/lib/server-rate-limit';

export const dynamic = 'force-dynamic';

const resetSchema = z.object({
  email: z.string().trim().email(),
});

const makeRateLimitResponse = (retryAfterSeconds: number) =>
  NextResponse.json(
    {
      error: `Too many reset attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minutes.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );

export async function POST(request: Request) {
  let parsedBody: z.infer<typeof resetSchema>;
  try {
    parsedBody = resetSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const email = normalizeEmailForLimit(parsedBody.email);
  const ip = getClientIp(request);

  const ipLimit = consumeRateLimit(`auth:reset:ip:${ip}`, 20, 60 * 60 * 1000);
  if (!ipLimit.allowed) return makeRateLimitResponse(ipLimit.retryAfterSeconds);

  const accountLimit = consumeRateLimit(`auth:reset:account:${ip}:${email}`, 4, 60 * 60 * 1000);
  if (!accountLimit.allowed) return makeRateLimitResponse(accountLimit.retryAfterSeconds);

  const supabase = await createRouteHandlerSupabaseClient();
  const redirectTo = `${new URL(request.url).origin}/auth/callback`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return NextResponse.json(
      { error: 'Could not send reset email. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
