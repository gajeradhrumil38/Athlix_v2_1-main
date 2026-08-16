import React, { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Dumbbell, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getTodayTrainingRecommendation,
  sendRecommendationFeedback,
  type TrainingRecommendation,
} from '../../features/recommendations/services/trainingRecommendation';

const intensityColor: Record<string, string> = {
  heavy: '#C8FF00',
  moderate: '#4FC3F7',
  light: '#fbbf24',
  recovery: '#afa9ec',
  rest: '#f87171',
};

const tierLabel: Record<string, string> = {
  green: 'Ready',
  yellow: 'Controlled',
  red: 'Recover',
  unknown: 'Estimated',
};

const recoveryTone = (r: number) => (r >= 67 ? '#4ade80' : r >= 34 ? '#fbbf24' : '#f87171');

const StatTile: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone = 'var(--text-primary)' }) => (
  <div className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
    <div className="text-[7.5px] font-extrabold uppercase tracking-[0.1em] truncate" style={{ color: 'var(--text-muted)' }}>{label}</div>
    <div className="text-[15px] font-black leading-tight tabular-nums mt-0.5" style={{ color: tone }}>{value}</div>
    {sub && <div className="text-[8px] font-semibold truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
  </div>
);

export const TrainingRecommendationCard: React.FC<{ active: boolean }> = ({ active }) => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [recommendation, setRecommendation] = useState<TrainingRecommendation | null>(null);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      setRecommendation(await getTodayTrainingRecommendation(force));
    } catch (err) {
      console.warn('Training recommendation unavailable:', err);
      setError('Plan unavailable');
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleStart = async () => {
    if (!recommendation) return;
    sendRecommendationFeedback(recommendation.id, 'accepted', { chosenMuscles: recommendation.muscles }).catch(() => {});
    navigate('/log', {
      state: {
        preselectedMuscles: recommendation.muscles,
        suggestedTitle: recommendation.title,
        recommendedExercises: recommendation.exercises,
      },
    });
  };

  if (loading) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-3 h-full flex flex-col gap-2">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-7 w-32 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-8 w-full rounded-xl mt-auto" />
      </div>
    );
  }

  if (error || !recommendation) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-3 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Dumbbell className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--text-secondary)] font-bold">Train Today</span>
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-[1.45]">
            Couldn't load today's plan. Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          className="mt-3 px-3 py-2 rounded-xl text-[10px] font-bold bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20"
        >
          Try Again
        </button>
      </div>
    );
  }

  const tone = intensityColor[recommendation.intensity] ?? 'var(--accent)';
  const confidence = Math.round((recommendation.confidence ?? 0) * 100);
  const ins = recommendation.insights;
  const over = ins?.overreaching;
  const overColor = over?.level === 'high' ? '#f87171' : '#fbbf24';
  const topReason = recommendation.reasons?.[0];

  // Scannable metric tiles built from the data-driven insights.
  const tiles: { label: string; value: string; sub?: string; tone?: string }[] = [];
  if (ins?.strain_target) {
    const s = ins.strain_target;
    tiles.push({ label: 'Recovery', value: `${s.recovery}%`, sub: tierLabel[recommendation.readiness_tier] ?? 'ready', tone: recoveryTone(s.recovery) });
    const strainTone = s.today == null ? 'var(--text-primary)' : s.today > s.high ? '#f97316' : s.today < s.low ? '#4FC3F7' : '#4ade80';
    tiles.push({ label: 'Strain', value: s.today != null ? `${s.today}` : '—', sub: `aim ${s.low}–${s.high}`, tone: strainTone });
  }
  if (ins?.recovery_forecast) {
    const f = ins.recovery_forecast;
    tiles.push({ label: 'Tomorrow', value: `${f.if_train}%`, sub: `rest ${f.if_rest}%`, tone: recoveryTone(f.if_train) });
  }
  if (ins?.sleep_debt && ins.sleep_debt.debt_hours_7d >= 1) {
    const d = ins.sleep_debt.debt_hours_7d;
    tiles.push({ label: 'Sleep debt', value: `${d}h`, sub: 'protect sleep', tone: d >= 6 ? '#f87171' : d >= 3 ? '#fbbf24' : 'var(--text-primary)' });
  }

  return (
    <div className="relative overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-3 h-full flex flex-col">
      {/* Breathing edge glow — bright at the border, fading inward, tinted by
          today's intensity. Flows inward via a subtle scale + opacity pulse. */}
      {reduceMotion ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: `radial-gradient(125% 110% at 50% 50%, transparent 54%, ${tone}22 100%)` }} />
      ) : (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ background: `radial-gradient(125% 110% at 50% 50%, transparent 54%, ${tone}2e 100%)`, transformOrigin: 'center' }}
          animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 0.965, 1] }}
          transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative z-10 flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: tone }} />
          <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--text-secondary)] font-bold truncate">Train Today</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          aria-label="Refresh recommendation"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <button type="button" onClick={handleStart} className="relative z-10 text-left flex-1 flex flex-col min-h-0 cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[16px] font-black text-[var(--text-primary)] leading-[1.05] truncate">{recommendation.title}</h3>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-extrabold uppercase tracking-[0.08em]" style={{ color: tone, background: `${tone}18`, border: `1px solid ${tone}33` }}>
                {recommendation.intensity}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border)]">
                {tierLabel[recommendation.readiness_tier] ?? 'Ready'}
              </span>
              {recommendation.muscles.slice(0, 3).map((muscle) => (
                <span key={muscle} className="px-1.5 py-0.5 rounded-md text-[8px] font-semibold bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
                  {muscle}
                </span>
              ))}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone }} />
        </div>

        {topReason && (
          <p className="text-[9.5px] text-[var(--text-secondary)] leading-[1.35] mt-2 line-clamp-2">
            <span className="font-bold text-[var(--text-primary)]">{topReason.label}: </span>{topReason.detail}
          </p>
        )}

        {over && over.level !== 'ok' && over.flags.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 mt-2" style={{ background: `${overColor}18`, border: `1px solid ${overColor}40` }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: overColor }} />
            <span className="text-[9px] font-bold shrink-0" style={{ color: overColor }}>{over.level === 'high' ? 'Overreaching risk' : 'Watch'}</span>
            <span className="text-[9px] truncate" style={{ color: 'var(--text-secondary)' }}>· {over.flags.join('; ')}</span>
          </div>
        )}

        {tiles.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {tiles.map((t) => <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone} />)}
          </div>
        )}

        {recommendation.strain_insight && recommendation.strain_insight.blend_weight >= 0.4 && (
          <p className="text-[9px] text-[var(--text-muted)] leading-[1.35] mt-2">
            Last session {recommendation.strain_insight.actual_strain} strain vs ~{recommendation.strain_insight.expected_strain} expected · {recommendation.strain_insight.verdict}
          </p>
        )}

        <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
          {recommendation.exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.name} className="flex items-center justify-between gap-2 text-[9.5px]">
              <span className="truncate text-[var(--text-secondary)]">{exercise.name}</span>
              <span className="shrink-0 font-bold text-[var(--text-primary)] tabular-nums">{exercise.sets} × {exercise.reps}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-2 flex items-center gap-1.5 text-[8.5px] text-[var(--text-muted)]">
          <ShieldCheck className="w-3 h-3" />
          <span>{confidence}% confidence · {recommendation.strain_insight ? 'personalized' : 'explainable'} · v2</span>
        </div>
      </button>
    </div>
  );
};
