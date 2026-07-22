'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { consumeDashboardSessionTokens } from '@/lib/dashboard-session-bridge';

interface Props {
  accessToken: string;
  refreshToken: string;
}

export function LegacyDashboardApp({ accessToken, refreshToken }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [isFrameLoaded, setIsFrameLoaded] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<{
    accessToken: string;
    refreshToken: string;
  }>({
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
  });
  const [showFallbackHint, setShowFallbackHint] = useState(false);

  const hasTokens = Boolean(sessionTokens.accessToken && sessionTokens.refreshToken);

  useEffect(() => {
    if (hasTokens) return;
    const bridgedTokens = consumeDashboardSessionTokens();
    if (!bridgedTokens) return;
    setSessionTokens(bridgedTokens);
  }, [hasTokens]);

  useEffect(() => {
    if (accessToken && refreshToken) {
      setSessionTokens({ accessToken, refreshToken });
    }
  }, [accessToken, refreshToken]);

  useEffect(() => {
    let mounted = true;

    const applySession = (session: {
      access_token?: string;
      refresh_token?: string;
    } | null) => {
      if (!mounted || !session?.access_token || !session?.refresh_token) return;
      setSessionTokens({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !hasTokens) return;

    const inject = () => {
      iframe.contentWindow?.postMessage(
        {
          type: 'ATHLIX_SESSION',
          accessToken: sessionTokens.accessToken,
          refreshToken: sessionTokens.refreshToken,
        },
        window.location.origin,
      );
    };

    // The iframe may already be loaded by the time this effect runs
    if (
      iframe.contentDocument?.readyState === 'complete' ||
      iframe.contentDocument?.readyState === 'interactive'
    ) {
      inject();
    }

    // Also fire on load in case the iframe hasn't finished yet
    iframe.addEventListener('load', inject);
    const retry = window.setInterval(inject, 900);

    return () => {
      iframe.removeEventListener('load', inject);
      window.clearInterval(retry);
    };
  }, [hasTokens, sessionTokens.accessToken, sessionTokens.refreshToken]);

  useEffect(() => {
    if (hasTokens) {
      setShowFallbackHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowFallbackHint(true), 3000);
    return () => window.clearTimeout(timer);
  }, [hasTokens]);

  return (
    <main style={{ minHeight: '100dvh', background: '#0a0a0a', position: 'relative' }}>
      {!isFrameLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: '#95A9BE',
            fontSize: 14,
            letterSpacing: 0.2,
            zIndex: 2,
          }}
        >
          {showFallbackHint
            ? 'Preparing your dashboard... if this takes too long, refresh once.'
            : 'Loading your dashboard...'}
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Athlix Application"
        src="/legacy-app/index.html"
        onLoad={() => setIsFrameLoaded(true)}
        className="w-full border-0"
        style={{ height: '100dvh' }}
      />
    </main>
  );
}
