'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { stashDashboardSessionTokens } from '@/lib/dashboard-session-bridge';

const inputStyle: React.CSSProperties = {
  caretColor: '#C8FF00',
  WebkitBoxShadow: '0 0 0 1000px #1e1e1e inset',
  WebkitTextFillColor: '#f0f0f0',
};

const getPasswordStrength = (value: string) => {
  const score =
    (value.length >= 8 ? 1 : 0) +
    (/\d/.test(value) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0);
  if (score <= 1) return { label: 'Weak',   color: '#ff4d4d', segments: 1 };
  if (score <= 3) return { label: 'Fair',   color: '#f59e0b', segments: 2 };
  return             { label: 'Strong', color: '#4dff91', segments: 3 };
};

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);

  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [showNew, setShowNew]                   = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [loading, setLoading]                   = useState(false);
  const [errorMessage, setErrorMessage]         = useState<string | null>(null);
  const [successMessage, setSuccessMessage]     = useState<string | null>(null);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

  const waitForSessionTokens = async (): Promise<SessionTokens | null> => {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session?.refresh_token) {
        return {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        };
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return null;
  };

  const redirectToDashboard = async () => {
    const tokens = await waitForSessionTokens();
    stashDashboardSessionTokens(tokens);
    window.location.replace('/dashboard');
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) { setErrorMessage('Connection issue. Please try again.'); return; }
    if (newPassword.length < 8) { setErrorMessage('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setErrorMessage('Passwords do not match.'); return; }

    setLoading(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setLoading(false);
      setErrorMessage('Link expired or invalid. Request a new reset email.');
      return;
    }

    setLoading(false);
    setSuccessMessage('Password updated! Redirecting you in…');
    setTimeout(() => { void redirectToDashboard(); }, 2500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 py-12">
      <div className="w-full max-w-[400px]">

        {/* Wordmark */}
        <div className="mb-8 text-center">
          <div
            className="text-[48px] leading-none text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, "Arial Black", sans-serif)', letterSpacing: '0.04em' }}
          >
            ATHLIX
          </div>
          <p className="mt-1 text-[13px] text-[#555]">Set a new password</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <h2 className="mb-1 text-[18px] font-semibold text-[#f0f0f0]">Create new password</h2>
          <p className="mb-5 text-[13px] text-[#666]">Choose something secure — at least 8 characters.</p>

          {/* Error */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 rounded-lg border border-[#ff4d4d]/25 bg-[#ff4d4d]/8 p-3 text-[13px] text-[#ff8080]"
            >
              {errorMessage}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border border-[#4dff91]/25 bg-[#4dff91]/8 p-3"
              aria-live="polite"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4dff91]" />
              <p className="text-[13px] text-[#4dff91]">{successMessage}</p>
            </div>
          )}

          <form onSubmit={updatePassword} noValidate className="space-y-4">

            {/* New password */}
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-[12px] font-medium text-[#888]">
                New password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading || Boolean(successMessage)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-3 pr-10 text-[14px] text-[#f0f0f0] outline-none placeholder:text-[#444] transition-colors focus:border-[#C8FF00] disabled:opacity-50"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition-colors"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((seg) => (
                      <div
                        key={seg}
                        className="h-1 flex-1 rounded-full transition-all duration-200"
                        style={{ background: strength.segments >= seg ? strength.color : '#2a2a2a' }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px]" style={{ color: strength.color }}>{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-[12px] font-medium text-[#888]">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading || Boolean(successMessage)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-[#2a2a2a] bg-[#1e1e1e] px-3 pr-10 text-[14px] text-[#f0f0f0] outline-none placeholder:text-[#444] transition-colors focus:border-[#C8FF00] disabled:opacity-50"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888] transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPassword.length > 0 && (
                <p className="mt-1.5 text-[11px]" style={{ color: confirmPassword === newPassword ? '#4dff91' : '#ff4d4d' }}>
                  {confirmPassword === newPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || Boolean(successMessage)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-all disabled:opacity-50"
              style={{ background: '#C8FF00', color: '#000' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#b0e000'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#C8FF00'; }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
                : 'Update password'
              }
            </button>
          </form>

          <p className="mt-5 text-center text-[12px] text-[#555]">
            Link expired?{' '}
            <Link
              href="/login?showForgot=1"
              className="text-[#C8FF00] underline-offset-4 hover:underline"
            >
              Request a new reset email
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
