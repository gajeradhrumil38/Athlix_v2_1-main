import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    const requestHost = new URL(request.url).host;
    let originHost = '';
    try {
      originHost = new URL(originHeader).host;
    } catch {
      originHost = '';
    }

    if (!originHost || originHost !== requestHost) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }
  }

  const supabase = await createRouteHandlerSupabaseClient();
  await supabase.auth.signOut();

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, 303);
}
