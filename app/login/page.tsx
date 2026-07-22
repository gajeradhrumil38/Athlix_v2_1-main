'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';
import { stashDashboardSessionTokens } from '@/lib/dashboard-session-bridge';

const ATTEMPT_STORAGE_KEY = 'athlix_login_guard_v2';
const REMEMBER_EMAIL_KEY = 'athlix_login_remember_email_v2';
const REMEMBER_UNTIL_KEY = 'athlix_login_remember_until_v2';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const RESEND_WAIT_SECONDS = 60;

const emailSchema = z.string().trim().email();

type AttemptState = { failedAttempts: number; lockUntil: number | null };
const defaultAttemptState: AttemptState = { failedAttempts: 0, lockUntil: null };

const normalizeAttemptState = (state: AttemptState): AttemptState => {
  if (!state.lockUntil) return state;
  if (state.lockUntil <= Date.now()) return defaultAttemptState;
  return state;
};

const isSafePath = (path: string | null) =>
  !!path && path.startsWith('/') && !path.startsWith('//');

const getGenericAuthError = (message: string, status?: number) => {
  const normalized = message.toLowerCase();
  if (status === 429 || normalized.includes('too many requests'))
    return 'Too many attempts. Try again in 15 minutes.';
  if (normalized.includes('network') || normalized.includes('fetch'))
    return 'Connection issue. Please try again.';
  return 'Incorrect email or password. Try again.';
};

const FEATURES = [
  'Log workouts in seconds',
  'Monitor recovery & readiness',
  'Analyze performance over time',
];

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export default function LoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [attemptState, setAttemptState] = useState<AttemptState>(defaultAttemptState);
  const [failedHint, setFailedHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState<null | 'apple'>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAlreadyExistsPrompt, setShowAlreadyExistsPrompt] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotMessageType, setForgotMessageType] = useState<'success' | 'error'>('error');
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [forgotSending, setForgotSending] = useState(false);
  const [showApple, setShowApple] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [redirectPath, setRedirectPath] = useState('/dashboard');

  const lockTimeRemainingMinutes = useMemo(() => {
    if (!attemptState.lockUntil) return null;
    const remaining = attemptState.lockUntil - Date.now();
    if (remaining <= 0) return null;
    return Math.ceil(remaining / 60000);
  }, [attemptState.lockUntil]);

  const isLocked = Boolean(attemptState.lockUntil && attemptState.lockUntil > Date.now());
  const disableActions = submitting || Boolean(oauthSubmitting) || isLocked;

  const setErrorBanner = (message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
    setShakeNonce((n) => n + 1);
  };

  const markFailedAttempt = (forceLock = false) => {
    setAttemptState((prev) => {
      const normalized = normalizeAttemptState(prev);
      const failedAttempts = forceLock ? MAX_FAILED_ATTEMPTS : normalized.failedAttempts + 1;
      const lockUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_DURATION_MS : null;
      setFailedHint(failedAttempts >= 3);
      return { failedAttempts, lockUntil };
    });
  };

  const clearFailedAttempts = () => { setAttemptState(defaultAttemptState); setFailedHint(false); };

  const saveRememberPreference = (nextEmail: string) => {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, nextEmail);
      localStorage.setItem(REMEMBER_UNTIL_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_UNTIL_KEY);
    }
  };

  const redirectAfterSuccess = (path: string, tokens: SessionTokens | null) => {
    stashDashboardSessionTokens(tokens);
    window.location.replace(path);
  };

  const sendResetEmail = async (event?: FormEvent) => {
    event?.preventDefault();
    const candidateEmail = (forgotEmail || email).trim().toLowerCase();
    if (!emailSchema.safeParse(candidateEmail).success) {
      setForgotMessage('Enter a valid email address.');
      setForgotMessageType('error');
      return;
    }
    setForgotSending(true);
    setForgotMessage(null);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: candidateEmail }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setForgotSending(false);

    if (!response.ok) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After') || '0');
      if (retryAfterSeconds > 0) {
        setForgotCountdown(Math.min(retryAfterSeconds, 3600));
      }
      setForgotMessage(payload?.error || 'Could not send reset email. Try again.');
      setForgotMessageType('error');
      return;
    }
    setForgotMessage('Reset link sent! Check your inbox (and spam folder).');
    setForgotMessageType('success');
    setForgotCountdown(RESEND_WAIT_SECONDS);
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) { setErrorBanner('Connection issue. Please try again.'); return; }
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPassword = password;
    if (!emailSchema.safeParse(sanitizedEmail).success) { setErrorBanner('Incorrect email or password. Try again.'); return; }
    if (isLocked) { setErrorBanner('Too many attempts. Try again in 15 minutes.'); return; }
    setShowAlreadyExistsPrompt(false);
    setErrorMessage(null);
    setForgotMessage(null);
    setSubmitting(true);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: sanitizedEmail,
        password: sanitizedPassword,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; tokens?: SessionTokens | null }
      | null;

    if (!response.ok) {
      const genericMessage = getGenericAuthError(payload?.error || '', response.status);
      markFailedAttempt(response.status === 429 || genericMessage.includes('Too many attempts'));
      setPassword('');
      setSubmitting(false);
      setErrorBanner(payload?.error || genericMessage);
      return;
    }

    const tokens =
      payload?.tokens?.accessToken && payload?.tokens?.refreshToken
        ? payload.tokens
        : null;

    saveRememberPreference(sanitizedEmail);
    clearFailedAttempts();
    setSubmitting(false);
    setSuccessMessage('Welcome back!');
    redirectAfterSuccess(redirectPath, tokens);
  };

  const handleAppleLogin = async () => {
    if (!supabase) { setErrorBanner('Connection issue. Please try again.'); return; }
    if (isLocked) { setErrorBanner('Too many attempts. Try again in 15 minutes.'); return; }
    setErrorMessage(null);
    setOauthSubmitting('apple');
    const callbackUrl =
      `${window.location.origin}/auth/callback` +
      (redirectPath !== '/dashboard' ? `?next=${encodeURIComponent(redirectPath)}` : '');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: callbackUrl },
    });
    if (error) { setOauthSubmitting(null); setErrorBanner('Connection issue. Please try again.'); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPath = params.get('redirect');
    setRedirectPath(isSafePath(requestedPath) ? requestedPath ?? '/dashboard' : '/dashboard');

    const persistedAttemptState = localStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (persistedAttemptState) {
      try {
        const parsed = JSON.parse(persistedAttemptState) as AttemptState;
        const normalized = normalizeAttemptState(parsed);
        setAttemptState(normalized);
        setFailedHint(normalized.failedAttempts >= 3);
      } catch { localStorage.removeItem(ATTEMPT_STORAGE_KEY); }
    }

    const rememberUntil = Number(localStorage.getItem(REMEMBER_UNTIL_KEY) || '0');
    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || '';
    if (rememberUntil > Date.now() && rememberedEmail) {
      setEmail(rememberedEmail);
      setForgotEmail(rememberedEmail);
      setRememberMe(true);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_UNTIL_KEY);
    }

    const emailFromQuery = params.get('email');
    if (emailFromQuery) {
      const trimmedEmail = emailFromQuery.trim().toLowerCase();
      setEmail(trimmedEmail);
      setForgotEmail(trimmedEmail);
    }

    if (params.get('signup') === 'already_exists') { setShowAlreadyExistsPrompt(true); setErrorMessage(null); }
    if (params.get('error') === 'link_expired') {
      setErrorMessage('Your link has expired. Request a new one below.');
      setShakeNonce((n) => n + 1);
      setForgotOpen(true);
    }
    if (params.get('showForgot') === '1') setForgotOpen(true);

    const ua = navigator.userAgent;
    setShowApple(/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua));

    // Autofocus email (after remembered email is set)
    setTimeout(() => emailRef.current?.focus(), 80);
  }, []);

  useEffect(() => { localStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attemptState)); }, [attemptState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAttemptState((c) => normalizeAttemptState(c));
      setForgotCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      stashDashboardSessionTokens(
        session?.access_token && session?.refresh_token
          ? {
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
            }
          : null,
      );
      if (!cancelled) window.location.replace(redirectPath);
    });
    return () => { cancelled = true; };
  }, [redirectPath, supabase]);

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">

      {/* ── Left panel (desktop only) ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0d0d0d] p-12 md:flex md:w-1/2">
        {/* Geometric background pattern */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
        {/* Lime glow blob */}
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[#C8FF00] opacity-[0.06] blur-[80px]" />

        <div className="relative z-10">
          <div
            className="text-[72px] leading-none text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}
          >
            ATHLIX
          </div>
          <p className="mt-3 text-lg text-[#666]">Track. Recover. Perform.</p>
        </div>

        <div className="relative z-10 space-y-5">
          {FEATURES.map((feat) => (
            <div key={feat} className="flex items-start gap-4">
              <div className="mt-1 h-5 w-0.5 shrink-0 bg-[#C8FF00]" />
              <p className="text-[15px] text-[#888]">{feat}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto bg-[#141414] px-5 py-12 md:w-1/2">
        {/* Mobile wordmark */}
        <div className="mb-8 text-center md:hidden">
          <div
            className="text-[52px] leading-none text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}
          >
            ATHLIX
          </div>
          <p className="mt-1 text-sm text-[#666]">Track. Recover. Perform.</p>
        </div>

        <div className="w-full max-w-[400px]">
          <h2 className="mb-6 text-[22px] font-semibold text-[#f0f0f0]">Sign in</h2>

          {/* Shake wrapper */}
          <motion.div
            animate={shakeNonce > 0 ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Already-exists banner */}
            <AnimatePresence>
              {showAlreadyExistsPrompt && (
                <motion.div
                  key="already-exists"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200"
                >
                  <p>An account with this email already exists. Sign in instead?</p>
                  <button
                    type="button"
                    onClick={() => { setShowAlreadyExistsPrompt(false); setErrorMessage(null); }}
                    className="mt-2 inline-flex h-9 items-center rounded-md bg-amber-300 px-3 text-sm font-semibold text-amber-950"
                  >
                    Sign In
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start justify-between gap-3 rounded-lg border border-[#ff4d4d]/30 bg-[#ff4d4d]/10 p-3 text-sm text-[#ff8080]"
                >
                  <span>{errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="shrink-0 rounded p-1 hover:bg-[#ff4d4d]/20"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lockout */}
            {isLocked && (
              <div className="rounded-lg border border-[#ff4d4d]/30 bg-[#ff4d4d]/10 p-3 text-sm text-[#ff8080]">
                Too many attempts. Try again in {lockTimeRemainingMinutes || 15} min.
              </div>
            )}

            {/* Success */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-[#4dff91]/30 bg-[#4dff91]/10 p-3 text-sm text-[#4dff91]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {successMessage}
              </motion.div>
            )}

            {/* Form */}
            <form onSubmit={handleSignIn} noValidate className="space-y-4">
              <div>
                <label htmlFor="email" className="brand-label">Email</label>
                <input
                  ref={emailRef}
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => { const t = email.trim().toLowerCase(); setEmail(t); if (!forgotEmail) setForgotEmail(t); }}
                  disabled={disableActions}
                  className="brand-input"
                  aria-label="Email"
                />
              </div>

              <div>
                <label htmlFor="password" className="brand-label">Password</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={disableActions}
                    className="brand-input pr-12"
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={disableActions}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded text-[#888] hover:text-[#f0f0f0]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Forgot password — below password field, right-aligned */}
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => { setForgotOpen((v) => !v); setForgotMessage(null); setForgotEmail((c) => c || email.trim().toLowerCase()); }}
                    className="text-[12px] text-[#888] underline-offset-4 hover:text-[#f0f0f0] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {failedHint && (
                <p className="text-sm text-[#888]">Forgot your password? Use the reset option above.</p>
              )}

              {/* Remember me */}
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#888]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={disableActions}
                  className="h-4 w-4 rounded border-[#2a2a2a] bg-[#1e1e1e] accent-[#C8FF00]"
                />
                Remember me for 30 days
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={disableActions}
                className="brand-btn brand-btn-primary"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : successMessage ? (
                  <><CheckCircle2 className="h-4 w-4" /> Welcome back!</>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Forgot password panel */}
            <AnimatePresence>
              {forgotOpen && (
                <motion.div
                  key="forgot-panel"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <form
                    onSubmit={sendResetEmail}
                    noValidate
                    className="rounded-lg border border-[#C8FF00]/20 bg-[#1a1a1a] p-4"
                  >
                    <p className="mb-3 text-[13px] font-medium text-[#f0f0f0]">Reset your password</p>
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      onBlur={() => setForgotEmail(forgotEmail.trim().toLowerCase())}
                      placeholder="your@email.com"
                      className="brand-input"
                    />
                    <button
                      type="submit"
                      disabled={forgotSending || forgotCountdown > 0}
                      className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-50"
                      style={{ background: '#C8FF00', color: '#000' }}
                    >
                      {forgotSending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                        : forgotCountdown > 0
                          ? `Resend in ${forgotCountdown}s`
                          : 'Send reset link'
                      }
                    </button>
                    {forgotMessage && (
                      <p
                        className="mt-3 text-[13px]"
                        style={{ color: forgotMessageType === 'success' ? '#4dff91' : '#ff8080' }}
                        aria-live="polite"
                      >
                        {forgotMessage}
                      </p>
                    )}
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {showApple && (
              <>
                {/* Divider */}
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-[#444]">
                  <span className="h-px flex-1 bg-[#2a2a2a]" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-[#2a2a2a]" />
                </div>

                {/* OAuth */}
                <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleAppleLogin()}
                  disabled={disableActions}
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-black text-[14px] font-medium text-white border border-[#333] transition hover:bg-[#111] disabled:opacity-50"
                >
                  {oauthSubmitting === 'apple'
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <span className="text-xl"></span>
                  }
                  Continue with Apple
                </button>
                </div>
              </>
            )}

            {/* Footer links */}
            <p className="text-center text-[13px] text-[#666]">
              Don&apos;t have an account?{' '}
              <Link
                href={`/signup${redirectPath !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`}
                className="font-semibold text-[#C8FF00] underline-offset-4 hover:underline"
              >
                Sign up free
              </Link>
            </p>

            <p className="text-center text-[11px] text-[#444]">
              <Link href="/legacy-app/privacy.html" className="hover:text-[#888]">Privacy Policy</Link>
              {' · '}
              <Link href="/legacy-app/terms.html" className="hover:text-[#888]">Terms</Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
