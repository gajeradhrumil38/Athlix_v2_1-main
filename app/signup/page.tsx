'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase';
import { stashDashboardSessionTokens } from '@/lib/dashboard-session-bridge';

const emailSchema = z.string().trim().email();
const fullNameSchema = z.string().trim().min(2).max(80);

const isSafePath = (path: string | null) =>
  !!path && path.startsWith('/') && !path.startsWith('//');

const getPasswordStrength = (value: string) => {
  const lengthScore = value.length >= 8 ? 1 : 0;
  const hasNumber = /\d/.test(value) ? 1 : 0;
  const hasSymbol = /[^A-Za-z0-9]/.test(value) ? 1 : 0;
  const hasUpper = /[A-Z]/.test(value) ? 1 : 0;
  const score = lengthScore + hasNumber + hasSymbol + hasUpper;
  if (score <= 1) return { level: 'Weak', color: '#ff4d4d', width: '33%', score: 1 };
  if (score <= 3) return { level: 'Fair', color: '#f59e0b', width: '66%', score: 2 };
  return { level: 'Strong', color: '#4dff91', width: '100%', score: 3 };
};

const STATS = ['10,000+ workouts logged', '4.9★ avg rating', 'Free to start'];

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('/dashboard');

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const hasMinLength = password.length >= 8;
  const hasNumberOrSymbol = /[\d^A-Za-z]/.test(password) && !/^[A-Za-z]*$/.test(password);

  const goToSignInWithEmail = () => {
    const encodedEmail = encodeURIComponent(email.trim().toLowerCase());
    const redirectQuery = redirectPath !== '/dashboard' ? `&redirect=${encodeURIComponent(redirectPath)}` : '';
    router.replace(`/login?signup=already_exists&email=${encodedEmail}${redirectQuery}`);
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) { setErrorMessage('Connection issue. Please try again.'); return; }
    const sanitizedName = fullName.trim();
    const sanitizedEmail = email.trim().toLowerCase();
    if (!fullNameSchema.safeParse(sanitizedName).success) { setErrorMessage('Enter your full name.'); return; }
    if (!emailSchema.safeParse(sanitizedEmail).success) { setErrorMessage('Enter a valid email address.'); return; }
    if (password.length < 8) { setErrorMessage('Use at least 8 characters for your password.'); return; }
    if (!acceptedTerms) { setErrorMessage('You must agree to Terms & Privacy Policy.'); return; }
    setLoading(true);
    setAlreadyExists(false);
    setErrorMessage(null);
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signUp({
      email: sanitizedEmail,
      password,
      options: {
        data: { full_name: sanitizedName },
        emailRedirectTo,
      },
    });
    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('already registered') || error.code === 'user_already_exists') {
        setAlreadyExists(true);
        setLoading(false);
        return;
      }
      setErrorMessage(message.includes('network') || message.includes('fetch')
        ? 'Connection issue. Please try again.'
        : 'Unable to create your account right now. Please try again.');
      setLoading(false);
      return;
    }
    setSuccessMessage('Account created. Sending you to email confirmation...');
    setLoading(false);
    router.replace(`/verify-email?email=${encodeURIComponent(sanitizedEmail)}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryEmail = params.get('email');
    const requestedPath = params.get('redirect');
    setRedirectPath(isSafePath(requestedPath) ? requestedPath ?? '/dashboard' : '/dashboard');
    if (queryEmail) setEmail(queryEmail.trim().toLowerCase());
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

      {/* ── Left panel ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0d0d0d] p-12 md:flex md:w-1/2">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#C8FF00] opacity-[0.05] blur-[80px]" />

        <div className="relative z-10">
          <div
            className="text-[72px] leading-none text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}
          >
            ATHLIX
          </div>
          <p className="mt-3 text-[20px] font-semibold text-[#f0f0f0]">Start performing better</p>
          <p className="mt-1 text-[15px] text-[#666]">Join athletes who track smarter.</p>
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap gap-3">
            {STATS.map((stat) => (
              <div
                key={stat}
                className="rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-[13px] font-medium text-[#888]"
              >
                {stat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto bg-[#141414] px-5 py-12 md:w-1/2">
        {/* Mobile wordmark */}
        <div className="mb-8 text-center md:hidden">
          <div
            className="text-[52px] leading-none text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}
          >
            ATHLIX
          </div>
          <p className="mt-1 text-sm text-[#666]">Start performing better</p>
        </div>

        <div className="w-full max-w-[400px]">
          <h2 className="mb-6 text-[22px] font-semibold text-[#f0f0f0]">Create account</h2>

          {/* Already-exists */}
          {alreadyExists && (
            <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
              <p>An account with this email already exists.</p>
              <button
                type="button"
                onClick={goToSignInWithEmail}
                className="mt-2 inline-flex h-9 items-center rounded-md bg-amber-300 px-3 text-sm font-semibold text-amber-950"
              >
                Sign In instead
              </button>
            </div>
          )}

          {/* Error */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 rounded-lg border border-[#ff4d4d]/30 bg-[#ff4d4d]/10 p-3 text-sm text-[#ff8080]"
            >
              {errorMessage}
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#4dff91]/30 bg-[#4dff91]/10 p-3 text-sm text-[#4dff91]" aria-live="polite">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSignup} noValidate className="space-y-4">
            {/* Full name */}
            <div>
              <label htmlFor="full-name" className="brand-label">Full name</label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                inputMode="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onBlur={() => setFullName(fullName.trim())}
                disabled={loading}
                className="brand-input"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="brand-label">Email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmail(email.trim().toLowerCase())}
                disabled={loading}
                className="brand-input"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="brand-label">Password</label>
              <div className="relative">
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="brand-input pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded text-[#888] hover:text-[#f0f0f0]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((segment) => (
                      <div
                        key={segment}
                        className="h-1 flex-1 rounded-full transition-all duration-200"
                        style={{
                          background: passwordStrength.score >= segment
                            ? passwordStrength.color
                            : '#2a2a2a',
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[12px]" style={{ color: passwordStrength.color }}>
                    {passwordStrength.level} password
                  </p>
                </div>
              )}

              {/* Requirements checklist */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  {[
                    { met: hasMinLength, label: 'At least 8 characters' },
                    { met: hasNumberOrSymbol, label: 'Contains a number or symbol' },
                  ].map(({ met, label }) => (
                    <div key={label} className="flex items-center gap-2 text-[12px]">
                      <CheckCircle2
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: met ? '#4dff91' : '#444' }}
                      />
                      <span style={{ color: met ? '#4dff91' : '#666' }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#888]">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-[#2a2a2a] bg-[#1e1e1e] accent-[#C8FF00]"
              />
              <span>
                By creating an account you agree to our{' '}
                <Link href="/legacy-app/terms.html" className="text-[#C8FF00] underline-offset-4 hover:underline">
                  Terms
                </Link>
                {' '}and{' '}
                <Link href="/legacy-app/privacy.html" className="text-[#C8FF00] underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading} className="brand-btn brand-btn-primary">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#666]">
            Already have an account?{' '}
            <Link
              href={`/login${redirectPath !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectPath)}` : ''}`}
              className="font-semibold text-[#C8FF00] underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
