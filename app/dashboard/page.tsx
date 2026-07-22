import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';
import { LegacyDashboardApp } from '@/components/legacy/legacy-dashboard-app';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  // Authoritative check — verifies the JWT with Supabase servers
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Retrieve the raw tokens so we can inject them into the Vite iframe.
  // getSession() is intentionally used here (not getUser()) because we only
  // need the tokens, and we've already verified the user above.
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <LegacyDashboardApp
      accessToken={session?.access_token ?? ''}
      refreshToken={session?.refresh_token ?? ''}
    />
  );
}
