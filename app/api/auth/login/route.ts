import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';
import {
  consumeRateLimit,
  getClientIp,
  normalizeEmailForLimit,
} from '@/lib/server-rate-limit';

export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(1024),
});

const makeRateLimitResponse = (retryAfterSeconds: number) =>
  NextResponse.json(
    {
      error: `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minutes.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );

export async function POST(request: Request) {
  let parsedBody: z.infer<typeof loginSchema>;
  try {
    parsedBody = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const email = normalizeEmailForLimit(parsedBody.email);
  const ip = getClientIp(request);

  const ipLimit = consumeRateLimit(`auth:login:ip:${ip}`, 50, 10 * 60 * 1000);
  if (!ipLimit.allowed) return makeRateLimitResponse(ipLimit.retryAfterSeconds);

  const accountLimit = consumeRateLimit(`auth:login:account:${ip}:${email}`, 8, 15 * 60 * 1000);
  if (!accountLimit.allowed) return makeRateLimitResponse(accountLimit.retryAfterSeconds);

  const supabase = await createRouteHandlerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsedBody.password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: 'Incorrect email or password. Try again.' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    tokens:
      data.session?.access_token && data.session?.refresh_token
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          }
        : null,
  });
}
