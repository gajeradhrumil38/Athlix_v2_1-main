import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { supabase } from './lib/supabase';
import { applyTheme } from './theme/colors';

// Apply the colour palette as CSS custom properties before first render.
// To change any colour, edit src/theme/colors.ts — no other file needed.
applyTheme();

/**
 * Bootstrap: if running inside the Next.js /dashboard iframe, wait for the
 * parent to inject the Supabase session via postMessage BEFORE we render
 * React. This guarantees AuthContext.getCurrentUserAsync() finds a valid
 * user on first call, preventing the "black screen / redirect to /auth" bug.
 *
 * If running standalone (direct URL or not in an iframe), the wait is skipped
 * entirely and the app renders immediately.
 */
async function bootstrap() {
  // ── Step 1: Rescue Supabase auth tokens from the URL ────────────────────
  //
  // Supabase sends auth email links in two formats depending on project config:
  //
  // A) Implicit flow (older):
  //    https://app.url/legacy-app/#access_token=XXX&refresh_token=YYY&type=recovery
  //    HashRouter would treat everything after # as a route — we intercept first.
  //
  // B) PKCE flow (default for @supabase/ssr / newer projects):
  //    https://app.url/legacy-app/?code=XXX&type=recovery
  //    No hash conflict, but we still need to detect the recovery type flag.
  //
  // In both cases we set sessionStorage so AuthContext can enter recovery mode
  // even if onAuthStateChange fires before React's useEffect listeners register.

  // ── A) Implicit flow: tokens in hash ────────────────────────────────────
  const rawHash = window.location.hash.slice(1); // strip leading #
  if (rawHash.includes('access_token=')) {
    try {
      const hp = new URLSearchParams(rawHash);
      const accessToken = hp.get('access_token');
      const refreshToken = hp.get('refresh_token');
      const authType = hp.get('type'); // 'recovery' | 'signup' | 'email_change'

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }

      if (authType === 'recovery') {
        sessionStorage.setItem('athlix:password_recovery', '1');
      }
    } catch (e) {
      console.warn('Failed to parse Supabase auth redirect (implicit):', e);
    }

    // Rewrite hash so HashRouter routes to "/" cleanly
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
  }

  // ── B) PKCE flow: code in query string ──────────────────────────────────
  // Supabase includes ?type=recovery in the PKCE reset URL.
  // We set the sessionStorage flag early; the SDK exchanges the code
  // automatically (detectSessionInUrl: true) and fires PASSWORD_RECOVERY
  // via onAuthStateChange — which also dispatches our custom event.
  const qp = new URLSearchParams(window.location.search);
  if (qp.get('type') === 'recovery') {
    sessionStorage.setItem('athlix:password_recovery', '1');
  }

  // ── Step 2: Iframe session injection (Next.js dashboard embed) ──────────
  const isInIframe = window.self !== window.top;

  if (isInIframe) {
    await new Promise<void>((resolve) => {
      const fallback = window.setTimeout(resolve, 1000);

      const handler = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if ((event.data as { type?: string })?.type !== 'ATHLIX_SESSION') return;

        window.clearTimeout(fallback);
        window.removeEventListener('message', handler);

        const { accessToken, refreshToken } = event.data as {
          type: string;
          accessToken: string;
          refreshToken: string;
        };

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }

        resolve();
      };

      window.addEventListener('message', handler);
    });
  }

  // Wait for all fonts (VictoryStriker + Inter) to be ready before first render.
  // This prevents FOUT — the loading screen holds until fonts are painted correctly.
  // Cap at 2s so a slow network doesn't block forever.
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
