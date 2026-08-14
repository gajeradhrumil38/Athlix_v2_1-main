import React, { useCallback, useEffect, useState } from 'react';
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

export const TrainingRecommendationCard: React.FC<{ active: boolean }> = ({ active }) => {
  const navigate = useNavigate();
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
            Backend plan will appear after the recommendation function is deployed.
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
  const topReasons = recommendation.reasons?.slice(0, 2) ?? [];
  const confidence = Math.round((recommendation.confidence ?? 0) * 100);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-3 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: tone }} />
          <span className="text-[9px] uppercase tracking-[1.4px] text-[var(--text-secondary)] font-bold truncate">Train Today</span>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
          aria-label="Refresh recommendation"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <button type="button" onClick={handleStart} className="text-left flex-1 flex flex-col min-h-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-black text-[var(--text-primary)] leading-[1.05] truncate">{recommendation.title}</h3>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-extrabold uppercase tracking-[0.08em]" style={{ color: tone, background: `${tone}18`, border: `1px solid ${tone}33` }}>
                {recommendation.intensity}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border)]">
                {tierLabel[recommendation.readiness_tier] ?? 'Ready'}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tone }} />
        </div>

        <div className="flex flex-wrap gap-1 mt-2">
          {recommendation.muscles.slice(0, 4).map((muscle) => (
            <span key={muscle} className="px-1.5 py-0.5 rounded-md text-[8px] font-semibold bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
              {muscle}
            </span>
          ))}
        </div>

        <div className="mt-2 space-y-1">
          {topReasons.map((reason) => (
            <p key={`${reason.label}-${reason.detail}`} className="text-[9.5px] text-[var(--text-secondary)] leading-[1.35] overflow-hidden">
              <span className="font-bold text-[var(--text-primary)]">{reason.label}: </span>{reason.detail}
            </p>
          ))}
        </div>

        <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1">
          {recommendation.exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.name} className="flex items-center justify-between gap-2 text-[9.5px]">
              <span className="truncate text-[var(--text-secondary)]">{exercise.name}</span>
              <span className="shrink-0 font-bold text-[var(--text-primary)]">{exercise.sets} x {exercise.reps}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-2 flex items-center gap-1.5 text-[8.5px] text-[var(--text-muted)]">
          <ShieldCheck className="w-3 h-3" />
          <span>{confidence}% confidence · explainable V1</span>
        </div>
      </button>
    </div>
  );
};
