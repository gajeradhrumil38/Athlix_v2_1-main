'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { stashDashboardSessionTokens } from '@/lib/dashboard-session-bridge';

/* ─── Step 1 — Sport ──────────────────────────────── */
const SPORTS = [
  { id: 'running',   icon: '🏃', label: 'Running' },
  { id: 'cycling',   icon: '🚴', label: 'Cycling' },
  { id: 'swimming',  icon: '🏊', label: 'Swimming' },
  { id: 'strength',  icon: '🏋️', label: 'Strength' },
  { id: 'crossfit',  icon: '⚡', label: 'CrossFit' },
  { id: 'other',     icon: '🎯', label: 'Other' },
] as const;

/* ─── Step 2 — Goal ───────────────────────────────── */
const GOALS = [
  { id: 'endurance',  label: 'Build endurance' },
  { id: 'strength',   label: 'Build strength' },
  { id: 'weight',     label: 'Lose weight' },
  { id: 'recovery',   label: 'Recover better' },
  { id: 'general',    label: 'General fitness' },
] as const;

type Sport = (typeof SPORTS)[number]['id'];
type Goal  = (typeof GOALS)[number]['id'];

const TOTAL_STEPS = 3;

const StepDots = ({ step }: { step: number }) => (
  <div className="mb-8 flex items-center justify-center gap-2">
    {Array.from({ length: TOTAL_STEPS }, (_, i) => (
      <div
        key={i}
        className="h-2 rounded-full transition-all duration-200"
        style={{
          width: i + 1 === step ? '24px' : '8px',
          background: i + 1 === step ? '#C8FF00' : i + 1 < step ? '#C8FF00' : '#2a2a2a',
          opacity: i + 1 < step ? 0.4 : 1,
        }}
      />
    ))}
    <span className="ml-2 text-[12px] text-[#555]">{step} of {TOTAL_STEPS}</span>
  </div>
);

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState(1);
  const [sport, setSport] = useState<Sport | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectToDashboardWithBridge = async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    stashDashboardSessionTokens(
      session?.access_token && session?.refresh_token
        ? {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          }
        : null,
    );
    window.location.replace('/dashboard');
  };

  const finish = async () => {
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        sport,
        goal,
        distanceUnit,
        weightUnit,
        onboardingCompleted: true,
      },
    });
    if (updateError) {
      setSaving(false);
      setError('Unable to save preferences. Please try again.');
      return;
    }
    await redirectToDashboardWithBridge();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-5 py-12">
      <div className="w-full max-w-[480px]">

        {/* Card */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-8">
          <StepDots step={step} />

          {/* ── Step 1: Sport ── */}
          {step === 1 && (
            <div>
              <h1 className="mb-1 text-[24px] font-semibold text-[#f0f0f0]">What do you train for?</h1>
              <p className="mb-6 text-[14px] text-[#666]">Pick the activity that best describes you.</p>
              <div className="grid grid-cols-3 gap-3">
                {SPORTS.map(({ id, icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSport(id)}
                    className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all"
                    style={{
                      borderColor: sport === id ? '#C8FF00' : '#2a2a2a',
                      background: sport === id ? 'rgba(200,255,0,0.06)' : '#1a1a1a',
                    }}
                  >
                    <span className="text-2xl">{icon}</span>
                    <span
                      className="text-[12px] font-medium"
                      style={{ color: sport === id ? '#C8FF00' : '#888' }}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => sport && setStep(2)}
                disabled={!sport}
                className="brand-btn brand-btn-primary mt-6"
              >
                Next
              </button>
            </div>
          )}

          {/* ── Step 2: Goal ── */}
          {step === 2 && (
            <div>
              <h1 className="mb-1 text-[24px] font-semibold text-[#f0f0f0]">What&apos;s your main goal?</h1>
              <p className="mb-6 text-[14px] text-[#666]">We&apos;ll tailor your experience around it.</p>
              <div className="space-y-2">
                {GOALS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGoal(id)}
                    className="flex h-12 w-full items-center rounded-lg border px-4 text-left text-[14px] font-medium transition-all"
                    style={{
                      borderColor: goal === id ? '#C8FF00' : '#2a2a2a',
                      background: goal === id ? 'rgba(200,255,0,0.06)' : '#1a1a1a',
                      color: goal === id ? '#C8FF00' : '#888',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex h-11 items-center gap-1 rounded-lg border border-[#2a2a2a] px-4 text-[13px] text-[#666] hover:text-[#f0f0f0]"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => goal && setStep(3)}
                  disabled={!goal}
                  className="brand-btn brand-btn-primary flex-1"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Preferences ── */}
          {step === 3 && (
            <div>
              <h1 className="mb-1 text-[24px] font-semibold text-[#f0f0f0]">A few quick preferences</h1>
              <p className="mb-6 text-[14px] text-[#666]">You can always change these later in settings.</p>

              <div className="space-y-5">
                {/* Distance unit */}
                <div>
                  <p className="brand-label mb-3">Distance units</p>
                  <div className="flex gap-2">
                    {(['km', 'mi'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setDistanceUnit(u)}
                        className="flex-1 rounded-lg border py-3 text-[14px] font-semibold uppercase transition-all"
                        style={{
                          borderColor: distanceUnit === u ? '#C8FF00' : '#2a2a2a',
                          background: distanceUnit === u ? 'rgba(200,255,0,0.08)' : '#1a1a1a',
                          color: distanceUnit === u ? '#C8FF00' : '#666',
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Weight unit */}
                <div>
                  <p className="brand-label mb-3">Weight units</p>
                  <div className="flex gap-2">
                    {(['kg', 'lbs'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setWeightUnit(u)}
                        className="flex-1 rounded-lg border py-3 text-[14px] font-semibold uppercase transition-all"
                        style={{
                          borderColor: weightUnit === u ? '#C8FF00' : '#2a2a2a',
                          background: weightUnit === u ? 'rgba(200,255,0,0.08)' : '#1a1a1a',
                          color: weightUnit === u ? '#C8FF00' : '#666',
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-4 text-[13px] text-[#ff8080]">{error}</p>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex h-11 items-center gap-1 rounded-lg border border-[#2a2a2a] px-4 text-[13px] text-[#666] hover:text-[#f0f0f0]"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={saving}
                  className="brand-btn brand-btn-primary flex-1"
                >
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Finish setup'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Skip link */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { void redirectToDashboardWithBridge(); }}
            className="text-[12px] text-[#444] underline-offset-4 hover:text-[#888] hover:underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
