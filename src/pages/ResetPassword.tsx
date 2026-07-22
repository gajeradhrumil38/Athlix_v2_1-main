import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { updatePassword } from '../lib/supabaseData';

const inputStyle: React.CSSProperties = {
  caretColor: '#C8FF00',
  WebkitBoxShadow: '0 0 0 1000px #111827 inset',
  WebkitTextFillColor: '#f0f0f0',
};

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

export const ResetPassword: React.FC = () => {
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = getStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      // Wait for success animation, then clear recovery mode → AppRoutes renders
      // the normal route tree. Since user is already authenticated, ProtectedRoute
      // will show the dashboard directly.
      setTimeout(() => {
        clearPasswordRecovery();
        // Belt-and-suspenders: also push to root hash so HashRouter lands on home
        window.location.hash = '#/';
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[400px]"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-[28px] font-black tracking-[0.12em] text-[#C8FF00]">ATHLIX</span>
        </div>

        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 rounded-2xl border border-green-500/20 bg-green-500/8 p-8 text-center"
          >
            <CheckCircle2 className="h-12 w-12 text-green-400" />
            <div>
              <p className="text-[17px] font-bold text-white">Password updated!</p>
              <p className="mt-1 text-[13px] text-white/40">Taking you back to the app…</p>
            </div>
          </motion.div>
        ) : (
          <>
            <h2 className="mb-1 text-[24px] font-bold text-white">Set new password</h2>
            <p className="mb-6 text-[14px] text-white/40">Choose a strong password for your account.</p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-red-500/25 bg-red-500/8 p-3.5"
              >
                <p className="text-[13px] text-red-300">{error}</p>
                <button type="button" onClick={() => setError(null)} className="shrink-0 text-red-400/70">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/50">New password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    disabled={loading}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3.5 pr-11 text-[14px] text-white/90 outline-none placeholder:text-white/20 focus:border-[var(--accent)]/60"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {password.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 space-y-1">
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
                      <span className="text-white/30">{password.length >= 8 ? '✓ 8+ chars' : '8+ chars required'}</span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-white/50">Confirm password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  disabled={loading}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[var(--bg-elevated)] px-3.5 text-[14px] text-white/90 outline-none placeholder:text-white/20 focus:border-[var(--accent)]/60"
                  style={inputStyle}
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className="mt-1.5 text-[11px] text-red-400">Passwords don't match</p>
                )}
                {confirm.length > 0 && password === confirm && (
                  <p className="mt-1.5 text-[11px] text-green-400">✓ Passwords match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || password !== confirm || password.length < 8}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: '#C8FF00', color: '#000' }}
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : 'Update password'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};
