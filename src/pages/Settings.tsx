import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  Moon, Scale, Activity, LogOut, LayoutDashboard,
  ChevronRight, Trash2, Dumbbell, User, Save, Loader2, CheckCircle, XCircle, Sparkles, Eye, EyeOff,
  Timer, Pencil, Check, X,
} from 'lucide-react';
import { HapticPicker } from '../components/shared/HapticPicker';
import { Link, useNavigate } from 'react-router-dom';
import { convertWeight, type WeightUnit } from '../lib/units';
import { whoopService } from '../features/whoop/services/whoopService';

/* ── WHOOP connect sub-section ─────────────────────────────── */
const WhoopConnect: React.FC<{ userId: string }> = ({ userId }) => {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showTokenFallback, setShowTokenFallback] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!userId) return;
    whoopService.getConnectionInfo(userId).then((info) => {
      setStatus(info?.connected ? 'connected' : 'disconnected');
      setConnectedAt(info?.connectedAt ?? null);
    });
  }, [userId]);

  const markConnected = () => {
    setStatus('connected');
    setConnecting(false);
    whoopService.getConnectionInfo(userId).then((info) => {
      if (info?.connectedAt) setConnectedAt(info.connectedAt);
    });
  };

  const handleConnect = () => {
    const authUrl = whoopService.buildAuthUrl(userId);
    const features = 'popup=yes,width=520,height=680,left=200,top=80';
    const popup = window.open(authUrl, 'whoop-auth', features);

    if (!popup || popup.closed) {
      // Popup was blocked — fall back to full-page redirect
      window.location.href = authUrl;
      return;
    }

    setConnecting(true);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; result?: string; msg?: string };
      if (data?.type !== 'whoop-oauth') return;
      window.removeEventListener('message', onMessage);
      clearInterval(pollClosed);

      if (data.result === 'connected') {
        toast.success('WHOOP connected!');
        markConnected();
      } else {
        const msg = data.msg ? decodeURIComponent(data.msg) : 'WHOOP connection failed';
        toast.error(msg);
        setConnecting(false);
      }
    };

    window.addEventListener('message', onMessage);

    // Clean up if user manually closes the popup
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        window.removeEventListener('message', onMessage);
        setConnecting(false);
      }
    }, 600);
  };

  // Fallback: paste access token directly (for when OAuth popup can't reach id.whoop.com)
  const handleTokenConnect = async () => {
    const t = tokenDraft.trim();
    if (!t) return;
    setValidating(true);
    try {
      await whoopService.connect(userId, t);
      setTokenDraft('');
      setShowTokenFallback(false);
      toast.success('WHOOP connected');
      markConnected();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      toast.error(e?.status === 401 ? 'Invalid token — check your access token' : (e?.message ?? 'Could not connect'));
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await whoopService.disconnect(userId);
      setStatus('disconnected');
      setConnectedAt(null);
      toast.success('WHOOP disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Status row */}
      <div className="flex items-center gap-2">
        {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--text-muted)' }} />}
        {status === 'connected' && <CheckCircle className="w-4 h-4 shrink-0" style={{ color: '#4ade80' }} />}
        {status === 'disconnected' && <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
        <span className="text-[13px] font-medium" style={{ color: status === 'connected' ? '#4ade80' : 'var(--text-secondary)' }}>
          {status === 'loading' ? 'Checking…' : status === 'connected' ? 'Connected' : 'Not connected'}
        </span>
        {status === 'connected' && connectedAt && (
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
            since {fmtDate(connectedAt)}
          </span>
        )}
      </div>

      {status === 'disconnected' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Connect your WHOOP account to sync Recovery, Sleep, Heart Rate, Steps &amp; Strain.
          </p>

          {/* Primary: OAuth popup */}
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="w-full h-10 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {connecting ? 'Waiting for WHOOP login…' : 'Connect with WHOOP'}
          </button>

          {/* Fallback: manual token */}
          <button
            type="button"
            onClick={() => setShowTokenFallback((v) => !v)}
            className="w-full text-[11px] text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            {showTokenFallback ? 'Hide manual option ↑' : 'OAuth not working? Use access token instead ↓'}
          </button>

          {showTokenFallback && (
            <div className="space-y-2">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Get a token from{' '}
                <a href="https://developer.whoop.com" target="_blank" rel="noreferrer"
                  className="underline" style={{ color: 'var(--accent)' }}>
                  developer.whoop.com
                </a>
                {' '}→ your app → <strong>Test</strong> tab → generate token.
              </p>
              <input
                type="password"
                placeholder="Paste access token"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleTokenConnect()}
                className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void handleTokenConnect()}
                disabled={validating || !tokenDraft.trim()}
                className="w-full h-9 rounded-xl border border-[var(--accent)]/40 text-[var(--accent)] text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
              >
                {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {validating ? 'Validating…' : 'Connect with token'}
              </button>
            </div>
          )}
        </>
      )}

      {status === 'connected' && (
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={disconnecting}
          className="w-full h-10 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          style={{ borderColor: 'rgba(248,113,113,0.3)', color: 'rgba(248,113,113,0.8)' }}
        >
          {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          Disconnect WHOOP
        </button>
      )}
    </div>
  );
};

/* ── Reusable sub-components ───────────────────────────── */

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="glass-card overflow-hidden">
    <div className="px-5 py-3 border-b border-[var(--border)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {title}
      </h3>
    </div>
    <div className="divide-y divide-[var(--border)]">{children}</div>
  </section>
);

const Row: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex items-center justify-between gap-4 px-5 py-4 ${className}`}>
    {children}
  </div>
);

const RowLabel: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 min-w-0">
    <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{title}</p>
      {subtitle && <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const Toggle: React.FC<{ on: boolean; onToggle: () => void; disabled?: boolean; label: string }> = ({
  on, onToggle, disabled, label,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    disabled={disabled}
    className={`toggle-track ${on ? 'on' : ''} disabled:opacity-40`}
  >
    <span className="toggle-thumb" />
  </button>
);

const SegmentControl: React.FC<{
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ options, value, onChange, disabled }) => (
  <div className="segment-control">
    {options.map((opt) => (
      <button
        key={opt}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt)}
        className={`${value === opt ? 'active' : ''} disabled:opacity-40`}
      >
        {opt}
      </button>
    ))}
  </div>
);

/* ── Main Settings page ────────────────────────────────── */

export const Settings: React.FC = () => {
  const { user, profile, loading, signOut, deleteAccount, updateProfile: saveProfileUpdate } = useAuth();
  const navigate = useNavigate();
  const [draftProfile, setDraftProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);
  const [metricsChanged, setMetricsChanged] = useState(false);
  const [defaultView, setDefaultView] = useState<'Day' | 'Week'>(
    () => (localStorage.getItem('defaultView') as 'Day' | 'Week') || 'Week'
  );
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem('athlix:gemini_api_key') || ''
  );
  const [geminiModel, setGeminiModel] = useState(
    () => localStorage.getItem('athlix:gemini_model') || 'gemini-2.5-flash'
  );
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [aiUsage, setAiUsage] = useState(() => {
    const raw = localStorage.getItem('athlix:api_usage');
    return raw ? JSON.parse(raw) : null;
  });

  const REST_STORAGE_KEY = 'athlix_default_rest_secs';
  const [defaultRestSecs, setDefaultRestSecs] = useState<number>(() => {
    const v = localStorage.getItem(REST_STORAGE_KEY);
    return v ? parseInt(v, 10) : 90;
  });
  const [showRestPicker, setShowRestPicker] = useState(false);
  const [draftRestMin, setDraftRestMin] = useState(0);
  const [draftRestSec, setDraftRestSec] = useState(0);

  const SEC_OPTIONS = [0, 15, 30, 45];
  const MIN_OPTIONS = Array.from({ length: 11 }, (_, i) => i); // 0–10

  const formatRest = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const openRestPicker = () => {
    const m = Math.floor(defaultRestSecs / 60);
    const s = defaultRestSecs % 60;
    setDraftRestMin(m);
    setDraftRestSec(SEC_OPTIONS.includes(s) ? s : 0);
    setShowRestPicker(true);
  };

  const saveRestDuration = () => {
    const total = Math.max(5, draftRestMin * 60 + draftRestSec);
    localStorage.setItem(REST_STORAGE_KEY, String(total));
    setDefaultRestSecs(total);
    setShowRestPicker(false);
    toast.success('Rest timer updated');
  };

  useEffect(() => {
    setDraftProfile(profile);
    setNameChanged(false);
    setMetricsChanged(false);
  }, [profile]);

  /* ── BMI ─────────────────────────────────────── */
  const bmi = (() => {
    const bwKg = draftProfile?.body_weight == null ? null
      : draftProfile.body_weight_unit === 'lbs'
        ? Number(draftProfile.body_weight) * 0.45359237
        : Number(draftProfile.body_weight);
    const hM = draftProfile?.height_feet != null && draftProfile?.height_inches != null
      ? ((Number(draftProfile.height_feet) * 12) + Number(draftProfile.height_inches)) * 0.0254
      : null;
    return bwKg && hM && hM > 0 ? bwKg / (hM * hM) : null;
  })();

  /* ── Save helpers ────────────────────────────── */
  const save = async (updates: Record<string, any>, successMsg: string) => {
    setSaving(true);
    try {
      await saveProfileUpdate(updates);
      toast.success(successMsg);
    } catch {
      toast.error('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveName = () => {
    if (!nameChanged) return;
    save({ full_name: draftProfile?.full_name }, 'Name updated');
    setNameChanged(false);
  };

  const saveMetrics = () => {
    if (!metricsChanged) return;
    save(
      {
        body_weight: draftProfile?.body_weight ?? null,
        body_weight_unit: draftProfile?.body_weight_unit || 'lbs',
        height_feet: draftProfile?.height_feet ?? null,
        height_inches: draftProfile?.height_inches ?? null,
      },
      'Body metrics saved',
    );
    setMetricsChanged(false);
  };

  const handleUnitChange = (unit: string) => {
    setDraftProfile((prev: any) => ({ ...prev, unit_preference: unit }));
    save({ unit_preference: unit }, `Weight unit → ${unit}`);
  };

  const handleThemeChange = (theme: string) =>
    save({ theme_preference: theme }, `Theme → ${theme}`);

  const handleToggle = (field: string, current: boolean) =>
    save({ [field]: !current }, 'Setting updated');

  const handleBodyWeightUnitChange = (nextUnit: WeightUnit) => {
    setDraftProfile((prev: any) => {
      if (!prev || prev.body_weight_unit === nextUnit) return prev;
      const nextWeight =
        prev.body_weight == null
          ? null
          : convertWeight(Number(prev.body_weight), prev.body_weight_unit, nextUnit, 0.1);
      return { ...prev, body_weight: nextWeight, body_weight_unit: nextUnit };
    });
    setMetricsChanged(true);
  };

  const saveGeminiKey = () => {
    const trimmed = geminiKey.trim();
    if (trimmed) {
      localStorage.setItem('athlix:gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('athlix:gemini_api_key');
    }
    localStorage.setItem('athlix:gemini_model', geminiModel);
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
  };

  /* ── Delete account ──────────────────────────── */
  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete your account and all data permanently? This cannot be undone.',
    );
    if (!confirmed) return;
    try {
      await deleteAccount();
      toast.success('Account deleted');
      navigate('/auth', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    }
  };

  /* ── Loading skeleton ────────────────────────── */
  if (loading || !draftProfile) {
    return (
      <div className="max-w-lg mx-auto space-y-4 pb-10">
        <div className="skeleton h-7 w-32 rounded-xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  /* ── Avatar initial ──────────────────────────── */
  const initial = draftProfile?.full_name?.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10 animate-fade-in">
      <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Settings</h1>

      {/* ── Profile card ──────────────────────── */}
      <SectionCard title="Profile">
        {/* Avatar + info */}
        <div className="px-5 py-5 flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center text-[22px] font-bold shrink-0 border border-[var(--accent)]/25"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-[var(--text-primary)] truncate">
              {draftProfile?.full_name || 'Athlete'}
            </p>
            <p className="text-[13px] text-[var(--text-muted)] truncate">{user?.email}</p>
          </div>
        </div>

        {/* Display name input */}
        <div className="px-5 pb-5">
          <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
            Display name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={draftProfile?.full_name || ''}
              onChange={(e) => {
                setDraftProfile({ ...draftProfile, full_name: e.target.value });
                setNameChanged(true);
              }}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="flex-1 h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
              placeholder="Your name"
            />
            <button
              onClick={saveName}
              disabled={saving || !nameChanged}
              className="h-10 px-4 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center gap-1.5 disabled:opacity-40 transition-opacity"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Preferences ───────────────────────── */}
      <SectionCard title="Preferences">
        {/* Dashboard layout */}
        <Link to="/settings/layout" className="block group">
          <Row className="hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer">
            <RowLabel
              icon={<LayoutDashboard className="w-4 h-4" />}
              title="Dashboard Layout"
              subtitle="Customize home screen widgets"
            />
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
          </Row>
        </Link>

        {/* Weight unit */}
        <Row>
          <RowLabel
            icon={<Scale className="w-4 h-4" />}
            title="Weight Unit"
            subtitle="Applies to all logging & history"
          />
          <SegmentControl
            options={['kg', 'lbs']}
            value={draftProfile?.unit_preference || 'lbs'}
            onChange={handleUnitChange}
            disabled={saving}
          />
        </Row>

        {/* Theme */}
        <Row>
          <RowLabel
            icon={<Moon className="w-4 h-4" />}
            title="Theme"
            subtitle="App appearance"
          />
          <SegmentControl
            options={['dark', 'darker']}
            value={draftProfile?.theme_preference || 'dark'}
            onChange={handleThemeChange}
            disabled={saving}
          />
        </Row>

        {/* Default view */}
        <Row>
          <RowLabel
            icon={<LayoutDashboard className="w-4 h-4" />}
            title="Default View"
            subtitle="Starting tab on the home screen"
          />
          <SegmentControl
            options={['Day', 'Week']}
            value={defaultView}
            onChange={(v) => {
              localStorage.setItem('defaultView', v);
              setDefaultView(v as 'Day' | 'Week');
            }}
          />
        </Row>

        {/* Live add exercise */}
        <Row>
          <RowLabel
            icon={<Dumbbell className="w-4 h-4" />}
            title="Live Add Exercise"
            subtitle="Always available during workouts"
          />
          <span className="inline-flex h-6 items-center rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2.5 text-[11px] font-semibold text-[var(--accent)]">
            Always On
          </span>
        </Row>

        {/* Show start sheet */}
        <Row>
          <RowLabel
            icon={<Dumbbell className="w-4 h-4" />}
            title="Start Sheet"
            subtitle="Template picker before workout"
          />
          <Toggle
            on={!!draftProfile?.show_start_sheet}
            onToggle={() => handleToggle('show_start_sheet', !!draftProfile?.show_start_sheet)}
            disabled={saving}
            label="Toggle start sheet"
          />
        </Row>

        {/* Default rest timer */}
        <Row>
          <RowLabel
            icon={<Timer className="w-4 h-4" />}
            title="Default Rest Timer"
            subtitle="Auto-starts after each set"
          />
          <button
            onClick={openRestPicker}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors active:opacity-70"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <span className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatRest(defaultRestSecs)}
            </span>
            <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </Row>

        {/* Inline rest timer dial picker */}
        {showRestPicker && (
          <div className="px-5 pb-5 pt-1">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Set rest duration</p>
                <button onClick={() => setShowRestPicker(false)}>
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div className="px-4 py-4">
                <div className="flex items-center justify-center gap-3">
                  {/* Minutes dial */}
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-center mb-2" style={{ color: 'var(--text-muted)' }}>MIN</p>
                    <HapticPicker
                      items={MIN_OPTIONS}
                      value={draftRestMin}
                      onChange={(v) => setDraftRestMin(Number(v))}
                      itemHeight={44}
                      visibleItems={3}
                    />
                  </div>
                  <span className="text-[28px] font-black mb-1 shrink-0" style={{ color: 'var(--text-primary)' }}>:</span>
                  {/* Seconds dial */}
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-center mb-2" style={{ color: 'var(--text-muted)' }}>SEC</p>
                    <HapticPicker
                      items={SEC_OPTIONS}
                      value={draftRestSec}
                      onChange={(v) => setDraftRestSec(Number(v))}
                      itemHeight={44}
                      visibleItems={3}
                    />
                  </div>
                </div>
                {/* Live preview */}
                <p className="text-center text-[13px] mt-3" style={{ color: 'var(--text-muted)' }}>
                  {draftRestMin * 60 + draftRestSec > 0
                    ? `${draftRestMin * 60 + draftRestSec} seconds between sets`
                    : 'Timer disabled (0 seconds)'}
                </p>
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <button
                  onClick={() => setShowRestPicker(false)}
                  className="flex-1 h-10 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveRestDuration}
                  className="flex-1 h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  <Check className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Body metrics ──────────────────────── */}
      <SectionCard title="Body Metrics">
        <div className="px-5 py-5 space-y-4">
          <p className="text-[12px] text-[var(--text-muted)]">
            Used to normalize muscle load by body size.
            {bmi ? ` BMI: ${bmi.toFixed(1)}` : ''}
          </p>

          {/* Body weight */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
              Body weight
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draftProfile?.body_weight ?? ''}
                onChange={(e) => {
                  setDraftProfile({ ...draftProfile, body_weight: e.target.value === '' ? null : Number(e.target.value) });
                  setMetricsChanged(true);
                }}
                className="flex-1 h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                placeholder="e.g. 75"
              />
              <SegmentControl
                options={['kg', 'lbs']}
                value={draftProfile?.body_weight_unit || 'lbs'}
                onChange={(v) => handleBodyWeightUnitChange(v as WeightUnit)}
              />
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
              Height
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draftProfile?.height_feet ?? ''}
                  onChange={(e) => {
                    setDraftProfile({ ...draftProfile, height_feet: e.target.value === '' ? null : Number(e.target.value) });
                    setMetricsChanged(true);
                  }}
                  className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-9 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                  placeholder="5"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-muted)] pointer-events-none">ft</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="11"
                  step="1"
                  value={draftProfile?.height_inches ?? ''}
                  onChange={(e) => {
                    setDraftProfile({ ...draftProfile, height_inches: e.target.value === '' ? null : Number(e.target.value) });
                    setMetricsChanged(true);
                  }}
                  className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-9 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 transition-colors"
                  placeholder="10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-muted)] pointer-events-none">in</span>
              </div>
            </div>
          </div>

          <button
            onClick={saveMetrics}
            disabled={saving || !metricsChanged}
            className="w-full h-10 rounded-xl bg-[var(--accent)] text-black text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Metrics
          </button>
        </div>
      </SectionCard>

      {/* ── Integrations ──────────────────────── */}
      <SectionCard title="Integrations">
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>WHOOP</span>
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Recovery, Sleep Efficiency, Heart Rate &amp; Steps
          </p>
        </div>
        <WhoopConnect userId={user?.id ?? ''} />
      </SectionCard>

      {/* ── AI Assistant ──────────────────────── */}
      <SectionCard title="AI Assistant">
        <div className="px-5 py-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">Gemini API Key</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Get a free key at aistudio.google.com
              </p>
            </div>
          </div>
          {/* Model selector */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-1.5">
              Model
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'gemini-2.5-flash', label: '2.5 Flash', note: '✦ Free · 250K tokens' },
                { id: 'gemini-2.5-flash-preview-05-20', label: '2.5 Flash Preview', note: 'Free · Latest' },
                { id: 'gemini-1.5-flash', label: '1.5 Flash', note: 'Free · 15 RPM' },
                { id: 'gemini-2.5-pro', label: '2.5 Pro', note: 'Paid only' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setGeminiModel(m.id)}
                  className="flex flex-col items-start px-3 py-2 rounded-xl border transition-all text-left"
                  style={{
                    background: geminiModel === m.id ? 'rgba(124,58,237,0.12)' : 'var(--bg-elevated)',
                    borderColor: geminiModel === m.id ? 'rgba(124,58,237,0.5)' : 'var(--border)',
                  }}
                >
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">{m.label}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{m.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveGeminiKey()}
              placeholder="AIza…"
              className="w-full h-10 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3.5 pr-10 text-[13px] text-[var(--text-primary)] outline-none focus:border-purple-500/50 transition-colors placeholder:text-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => setShowGeminiKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={saveGeminiKey}
            className="w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 text-white transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', opacity: geminiSaved ? 0.7 : 1 }}
          >
            {geminiSaved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Save API Key</>
            )}
          </button>
          {geminiKey && (
            <button
              type="button"
              onClick={() => { setGeminiKey(''); localStorage.removeItem('athlix:gemini_api_key'); }}
              className="w-full text-[12px] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
            >
              Remove key
            </button>
          )}

          {/* Usage stats */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              AI Usage
            </p>
            {aiUsage ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[18px] font-bold text-[var(--text-primary)]">
                      {aiUsage.month_tokens.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">tokens this month</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-[var(--text-primary)]">
                      {aiUsage.total_tokens.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">tokens all time</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-[var(--text-primary)]">
                      {aiUsage.month_requests}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">requests this month</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-bold text-[var(--text-primary)]">
                      {aiUsage.total_requests > 0
                        ? Math.round(aiUsage.total_tokens / aiUsage.total_requests).toLocaleString()
                        : '—'}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">avg tokens/request</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('athlix:api_usage');
                    setAiUsage(null);
                    toast.success('Usage stats reset');
                  }}
                  className="w-full text-[11px] text-[var(--text-muted)] hover:text-[var(--red)] transition-colors pt-1"
                >
                  Reset stats
                </button>
              </>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)]">No requests made yet.</p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Account ───────────────────────────── */}
      <SectionCard title="Account">
        <Row>
          <RowLabel
            icon={<User className="w-4 h-4" />}
            title="Email"
            subtitle={user?.email}
          />
        </Row>
        <div className="px-5 py-4 space-y-2.5">
          <button
            onClick={signOut}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border border-[var(--red)]/25 text-[14px] font-medium text-[var(--red)]/70 hover:bg-[var(--red)]/8 hover:text-[var(--red)] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account & Data
          </button>
        </div>
      </SectionCard>

      <p className="text-center text-[11px] text-[var(--text-muted)] pb-2">
        Athlix v2.1 · Track. Recover. Perform.
      </p>
    </div>
  );
};
