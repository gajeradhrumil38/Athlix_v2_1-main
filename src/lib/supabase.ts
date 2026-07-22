import { createBrowserClient } from '@supabase/ssr';

const env = import.meta.env as Record<string, string | undefined>;

// Hardcoded production fallbacks so the bundle works without env vars at
// build time (e.g. local `next dev` serving pre-built static files).
const DEFAULT_SUPABASE_URL = 'https://mrntwydykqsdawpklumf.supabase.co';
const DEFAULT_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybnR3eWR5a3FzZGF3cGtsdW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2NDUsImV4cCI6MjA4OTM0MTY0NX0.lSyzEFdyrwFNEmIlsxLs3bxn1ZZxdBZQUD1m4VZYaRc';

const supabaseUrl =
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_KEY;

// CRITICAL: Use createBrowserClient (from @supabase/ssr) instead of vanilla
// createClient. @supabase/ssr stores the session in COOKIES — which matches
// how the Next.js app stores it. If we used vanilla createClient (localStorage),
// the Vite app in the /dashboard iframe would never find the session that the
// Next.js login established, causing an instant redirect to /auth (black screen).
export const hasSupabaseConfig = true;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
