'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

const RESEND_SECONDS = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openMailHref = useMemo(() => {
    if (typeof navigator === 'undefined') return 'mailto:';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return 'message://';
    if (/Android/i.test(ua))
      return 'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end';
    return 'mailto:';
  }, []);

  const resendEmail = async () => {
    if (!supabase || !email || countdown > 0 || busy) return;
    setBusy(true);
    setMessage(null);
    const emailRedirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo },
    });
    setBusy(false);
    if (error) { setMessage('Unable to resend right now. Please try again.'); return; }
    setMessage('Email resent!');
    setCountdown(RESEND_SECONDS);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryEmail = (params.get('email') || '').trim().toLowerCase();
    if (!queryEmail) { router.replace('/signup'); return; }
    setEmail(queryEmail);
  }, [router]);

  useEffect(() => {
    if (!email) return;
    const timer = window.setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-5 py-12">
      <div className="w-full max-w-[420px] rounded-xl border border-[#2a2a2a] bg-[#141414] p-8 text-center">

        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#C8FF00]/20 bg-[#C8FF00]/8">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
        </div>

        <h1 className="text-[24px] font-semibold text-[#f0f0f0]">Check your inbox</h1>
        <p className="mt-2 text-[14px] text-[#888]">
          We sent a verification link to{' '}
          <span className="font-semibold text-[#C8FF00]">{email}</span>.
          Click the link to activate your account.
        </p>
        <p className="mt-1 text-[12px] text-[#555]">
          Check your spam folder if you don&apos;t see it.
        </p>

        {/* Open mail */}
        <a
          href={openMailHref}
          className="brand-btn brand-btn-primary mt-8 flex"
        >
          Open Mail App
        </a>

        {/* Resend */}
        <button
          type="button"
          onClick={resendEmail}
          disabled={countdown > 0 || busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] text-[13px] text-[#888] transition hover:border-[#444] hover:text-[#f0f0f0] disabled:opacity-40"
        >
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />
          }
          {countdown > 0 ? `Resend email in ${countdown}s` : 'Resend email'}
        </button>

        {message && (
          <p className="mt-3 text-[13px]" style={{ color: message.includes('Unable') ? '#ff8080' : '#4dff91' }} aria-live="polite">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => router.replace(`/signup?email=${encodeURIComponent(email)}`)}
          className="mt-4 text-[12px] text-[#555] underline-offset-4 hover:text-[#888] hover:underline"
        >
          Wrong email? Go back
        </button>
      </div>
    </div>
  );
}
