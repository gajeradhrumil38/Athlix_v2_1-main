import { useEffect } from 'react';
import { Activity } from 'lucide-react';

export const WhoopCallback: React.FC = () => {
  useEffect(() => {
    // Parse ?whoop=connected|error&msg=... from the hash portion
    const hash = window.location.hash; // "#/whoop/callback?whoop=connected"
    const qIdx = hash.indexOf('?');
    const params = new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx + 1) : '');
    const result = params.get('whoop') ?? 'error';
    const msg = params.get('msg') ?? '';

    if (window.opener) {
      try {
        window.opener.postMessage(
          { type: 'whoop-oauth', result, msg },
          window.location.origin,
        );
      } catch (_) {
        // opener gone — fall through to redirect
      }
      setTimeout(() => window.close(), 300);
    } else {
      // Opened without a popup (e.g. fallback full-page redirect) — go to settings
      window.location.replace('/#/settings');
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <Activity size={32} color="#C8FF00" />
      <p style={{ fontSize: 15, margin: 0 }}>Connecting WHOOP…</p>
      <p style={{ fontSize: 12, margin: 0, color: '#666' }}>This window will close automatically.</p>
    </div>
  );
};
