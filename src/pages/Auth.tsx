import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Eye, EyeOff, Loader2, X, Check, ArrowLeft } from 'lucide-react';
import { signInLocal, signUpLocal, sendPasswordResetEmail } from '../lib/supabaseData';

/* ─── Autofill override ───────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  caretColor: '#C8FF00',
  WebkitBoxShadow: '0 0 0 1000px #111827 inset',
  WebkitTextFillColor: '#f0f0f0',
};

/* ─── Password strength ───────────────────────────────────── */
const getStrength = (v: string) => {
  const score =
    (v.length >= 8 ? 1 : 0) +
    (/\d/.test(v) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(v) ? 1 : 0) +
    (/[A-Z]/.test(v) ? 1 : 0);
  if (score <= 1) return { label: 'Weak', color: '#ef4444', n: 1 };
  if (score <= 3) return { label: 'Fair', color: '#f59e0b', n: 2 };
  return { label: 'Strong', color: '#22c55e', n: 3 };
};

/* ─── Left-panel stat pill ────────────────────────────────── */
const StatPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="flex items-center gap-1.5 text-[13px] text-white/60">
    {children}
  </span>
);

export const Auth: React.FC = () => {
  const { user } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [cooldownSec, setCooldownSec] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';
  const strength = getStrength(password);

  if (user) return <Navigate to="/" replace />;

  const startCooldown = (seconds: number) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldownSec(seconds);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSec((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          cooldownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const shake = () => setShakeKey((k) => k + 1);

  const setErr = (msg: string) => {
    setError(msg);
    setSuccess(null);
    setAlreadyExists(false);
    shake();
  };

  const switchMode = (next: 'signin' | 'signup' | 'forgot') => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setAlreadyExists(false);
    setPassword('');
    setShowPw(false);
    setTimeout(() => (next === 'signup' ? nameRef.current?.focus() : emailRef.current?.focus()), 80);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSec > 0) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.includes('@')) { setErr('Enter a valid email address.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await sendPasswordResetEmail(trimmedEmail);
      setSuccess('Reset link sent! Check your inbox — it may take a minute.');
      startCooldown(60);
    } catch (err: any) {
      const msg: string = err?.message || '';
      const lower = msg.toLowerCase();
      const httpStatus: number = err?.status ?? 0;
      // Supabase rate-limit: status 429, or message contains wait-time hint
      const secMatch = msg.match(/(\d+)\s*second/i);
      const waitSec = Math.min(secMatch ? parseInt(secMatch[1], 10) : 60, 3600);
      const isRateLimit =
        httpStatus === 429 ||
        lower.includes('security purposes') ||
        lower.includes('rate limit') ||
        lower.includes('too many') ||
        lower.includes('email rate');

      if (isRateLimit) {
        setErr(`Too many reset attempts. Please wait ${waitSec < 120 ? `${waitSec}s` : `${Math.ceil(waitSec / 60)} min`} before trying again.`);
        startCooldown(waitSec);
      } else if (msg) {
        setErr(msg);
      } else {
        setErr('Could not send reset email. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); };
  }, []);

  useEffect(() => {
    setTimeout(() => (isSignUp ? nameRef.current?.focus() : emailRef.current?.focus()), 60);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const trimmedPassword = password;

    if (isSignUp && !trimmedName) { setErr('Please enter your full name.'); return; }
    if (!trimmedEmail.includes('@')) { setErr('Enter a valid email address.'); return; }
    if (trimmedPassword.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (isSignUp && !agreed) { setErr('Please agree to the Terms and Privacy Policy.'); return; }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setAlreadyExists(false);

    try {
      if (isSignUp) {
        await signUpLocal(trimmedEmail, trimmedPassword, trimmedName || trimmedEmail.split('@')[0]);
        setSuccess('Account created — welcome to Athlix!');
      } else {
        await signInLocal(trimmedEmail, trimmedPassword);
        setSuccess('Welcome back!');
      }
    } catch (err: any) {
      const msg: string = err?.message || 'An error occurred.';
      const lower = msg.toLowerCase();

      if (
        isSignUp &&
        (lower.includes('already registered') ||
          lower.includes('already in use') ||
          lower.includes('user_already_exists') ||
          lower.includes('already exists'))
      ) {
        setAlreadyExists(true);
        setError(null);
        setLoading(false);
        return;
      }

      if (msg.includes('Check your email')) {
        setSuccess(msg);
        setLoading(false);
        return;
      }

      setErr(
        lower.includes('invalid') || lower.includes('password') || lower.includes('credentials')
          ? 'Incorrect email or password. Try again.'
          : lower.includes('network') || lower.includes('fetch')
            ? 'Connection issue. Please try again.'
            : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      {/* ── Left panel ─────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[52%] min-h-screen relative overflow-hidden px-12 py-10"
        style={{
          background: 'linear-gradient(135deg, #0d0d0d 0%, #0f1a0a 50%, #0a0f05 100%)',
        }}
      >
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#C8FF00 1px, transparent 1px), linear-gradient(90deg, #C8FF00 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Glow blobs */}
        <div className="absolute top-[-120px] left-[-80px] w-[500px] h-[500px] rounded-full bg-[#C8FF00]/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-80px] right-[-60px] w-[400px] h-[400px] rounded-full bg-[#C8FF00]/4 blur-[100px] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10">
          <span
            className="text-[28px] font-black tracking-[0.12em] text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, "Arial Black", sans-serif)' }}
          >
            ATHLIX
          </span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[48px] leading-[1.08] font-bold text-white tracking-tight"
          >
            Start performing
            <br />
            <span className="text-[#C8FF00]">better.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 text-[17px] text-white/50 leading-relaxed max-w-[380px]"
          >
            Join athletes who track smarter, recover faster, and hit personal records.
          </motion.p>

          {/* Feature bullets */}
          <motion.ul
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 space-y-3"
          >
            {[
              'Workout logging with smart volume tracking',
              'Progress analytics & personal records',
              'Muscle map recovery insights',
            ].map((feat) => (
              <li key={feat} className="flex items-start gap-3 text-[14px] text-white/60">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C8FF00]/15 border border-[#C8FF00]/30">
                  <Check className="h-3 w-3 text-[#C8FF00]" />
                </span>
                {feat}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Stats row */}
        <div className="relative z-10 flex items-center gap-6 border-t border-white/[0.06] pt-6">
          <StatPill>
            <span className="text-[#C8FF00] font-bold">10,000+</span> workouts logged
          </StatPill>
          <span className="w-px h-4 bg-white/10" />
          <StatPill>
            <span className="text-[#C8FF00] font-bold">4.9★</span> avg rating
          </StatPill>
          <span className="w-px h-4 bg-white/10" />
          <StatPill>Free to start</StatPill>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 sm:px-8">
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <span
            className="text-[32px] font-black tracking-[0.12em] text-[#C8FF00]"
            style={{ fontFamily: 'var(--font-bebas, "Arial Black", sans-serif)' }}
          >
            ATHLIX
          </span>
        </div>

        <div className="lg-sheet w-full max-w-[420px] p-8" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20 }}>
          {/* Heading */}
          <div className="mb-6">
            {isForgot && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="mb-3 flex items-center gap-1.5 text-[13px] text-white/40 hover:text-white/70 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            )}
            <h2 className="text-[26px] font-bold text-white tracking-tight">
              {isSignUp ? 'Create account' : isForgot ? 'Forgot password?' : 'Sign in'}
            </h2>
            <p className="mt-1 text-[14px] text-white/40">
              {isSignUp
                ? 'Start tracking your performance today.'
                : isForgot
                  ? "Enter your email and we'll send a reset link."
                  : 'Welcome back to Athlix.'}
            </p>
          </div>

          {/* ── Already-exists banner ── */}
          <AnimatePresence>
            {alreadyExists && (
              <motion.div
                key="exists"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/8 p-3.5"
              >
                <p className="text-[13px] font-medium text-amber-200">
                  An account with this email already exists.
                </p>
                <button
                  type="button"
                  onClick={() => { setAlreadyExists(false); switchMode('signin'); }}
                  className="mt-2 inline-flex h-8 items-center rounded-lg bg-amber-300 px-3 text-[12px] font-semibold text-amber-950"
                >
                  Sign in instead →
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Error banner ── */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="alert"
                className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-red-500/25 bg-red-500/8 p-3.5"
              >
                <p className="text-[13px] text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 rounded p-0.5 text-red-400/70 hover:text-red-400"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Success banner ── */}
          <AnimatePresence>
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-4 flex items-center gap-2.5 rounded-xl border border-green-500/25 bg-green-500/8 p-3.5"
                aria-live="polite"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                <p className="text-[13px] text-green-300">{success}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Form ── */}
          <motion.form
            key={shakeKey}
            onSubmit={isForgot ? handleForgotPassword : handleAuth}
            noValidate
            animate={shakeKey > 0 ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Full name (sign-up only) */}
            <AnimatePresence initial={false}>
              {isSignUp && (
                <motion.div
                  key="fullname"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <label htmlFor="auth-name" className="mb-1.5 block text-[12px] font-medium text-white/50">
                    Full name
                  </label>
                  <input
                    ref={nameRef}
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); if (error) setError(null); }}
                    disabled={loading}
                    placeholder="Dhrumil Gajera"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3.5 text-[14px] text-white/90 outline-none placeholder:text-white/20 transition-colors focus:border-[var(--accent)]/60 focus:ring-0 disabled:opacity-50"
                    style={inputStyle}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-[12px] font-medium text-white/50">
                Email
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                onBlur={() => setEmail(email.trim().toLowerCase())}
                disabled={loading}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3.5 text-[14px] text-white/90 outline-none placeholder:text-white/20 transition-colors focus:border-[var(--accent)]/60 focus:ring-0 disabled:opacity-50"
                style={inputStyle}
              />
            </div>

            {/* Password — hidden in forgot mode */}
            <AnimatePresence initial={false}>
            {!isForgot && <motion.div
              key="password-block"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="auth-password" className="text-[12px] font-medium text-white/50">
                  Password
                </label>
                {!isSignUp && !isForgot && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[12px] text-white/35 hover:text-[#C8FF00] transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  disabled={loading}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3.5 pr-11 text-[14px] text-white/90 outline-none placeholder:text-white/20 transition-colors focus:border-[var(--accent)]/60 focus:ring-0 disabled:opacity-50"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Strength bar (sign-up only) */}
              <AnimatePresence>
                {isSignUp && password.length > 0 && (
                  <motion.div
                    key="strength"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 space-y-1"
                  >
                    <div className="flex gap-1">
                      {[1, 2, 3].map((seg) => (
                        <div
                          key={seg}
                          className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{ background: strength.n >= seg ? strength.color : '#1f2937' }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: strength.color }}>{strength.label}</span>
                      <span className="text-white/30">
                        {password.length >= 8 ? '✓ 8+ chars' : '8+ chars required'}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </motion.div>}
            </AnimatePresence>

            {/* Terms checkbox (sign-up only) */}
            <AnimatePresence initial={false}>
              {isSignUp && (
                <motion.div
                  key="terms"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={agreed}
                      onClick={() => setAgreed((v) => !v)}
                      disabled={loading}
                      className={`mt-0.5 h-4.5 w-4.5 shrink-0 rounded-[5px] border transition-all duration-150 flex items-center justify-center ${
                        agreed
                          ? 'bg-[#C8FF00] border-[#C8FF00]'
                          : 'bg-[var(--bg-elevated)] border-white/20 group-hover:border-white/40'
                      }`}
                      style={{ minWidth: 18, minHeight: 18 }}
                    >
                      {agreed && <Check className="h-3 w-3 text-black" strokeWidth={3} />}
                    </button>
                    <span className="text-[13px] text-white/40 leading-relaxed">
                      By creating an account you agree to our{' '}
                      <Link to="/terms" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">
                        Terms
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">
                        Privacy Policy
                      </Link>
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || (isForgot && cooldownSec > 0)}
              className="relative flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-all duration-150 disabled:opacity-60 active:scale-[0.98]"
              style={{ background: '#C8FF00', color: '#000' }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isForgot ? 'Sending…' : isSignUp ? 'Creating account…' : 'Signing in…'}
                </>
              ) : isForgot && cooldownSec > 0 ? (
                `Resend in ${cooldownSec}s`
              ) : isForgot ? (
                'Send reset link'
              ) : isSignUp ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </button>
          </motion.form>

          {/* ── Mode toggle ── */}
          {!isForgot && (
            <p className="mt-5 text-center text-[13px] text-white/35">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
                className="font-semibold text-white/70 hover:text-[#C8FF00] transition-colors"
              >
                {isSignUp ? 'Sign in' : 'Create account'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
