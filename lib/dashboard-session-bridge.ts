export type DashboardSessionTokens = {
  accessToken: string;
  refreshToken: string;
};

type DashboardSessionBridgePayload = DashboardSessionTokens & {
  createdAt: number;
};

const DASHBOARD_SESSION_BRIDGE_KEY = 'athlix:dashboard_session_bridge_v1';
const DASHBOARD_SESSION_BRIDGE_TTL_MS = 2 * 60 * 1000;

export const stashDashboardSessionTokens = (tokens: DashboardSessionTokens | null) => {
  if (!tokens || typeof window === 'undefined') return;

  const payload: DashboardSessionBridgePayload = {
    ...tokens,
    createdAt: Date.now(),
  };

  try {
    sessionStorage.setItem(DASHBOARD_SESSION_BRIDGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: fallback is regular cookie-based session propagation.
  }
};

export const consumeDashboardSessionTokens = (): DashboardSessionTokens | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(DASHBOARD_SESSION_BRIDGE_KEY);
    sessionStorage.removeItem(DASHBOARD_SESSION_BRIDGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DashboardSessionBridgePayload>;
    const age = Date.now() - Number(parsed.createdAt ?? 0);
    if (age < 0 || age > DASHBOARD_SESSION_BRIDGE_TTL_MS) return null;

    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
      return null;
    }

    if (!parsed.accessToken || !parsed.refreshToken) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
};
