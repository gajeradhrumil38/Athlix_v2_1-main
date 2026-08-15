import { supabase } from '../../../lib/supabase';
import type { StrainCostContext, RecoveryContext, InsightsContext } from '../../../lib/aiCoach';

export type TrainingIntensity = 'heavy' | 'moderate' | 'light' | 'recovery' | 'rest';
export type ReadinessTier = 'green' | 'yellow' | 'red' | 'unknown';

export interface TrainingExercisePlan {
  name: string;
  sets: number;
  reps: string;
}

export interface TrainingReason {
  label: string;
  detail: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface TrainingAlternative {
  type: string;
  title: string;
  score: number;
  muscles: string[];
  reason: string;
}

export interface TrainingRecommendation {
  id: string;
  date: string;
  title: string;
  recommendation_type: string;
  intensity: TrainingIntensity;
  readiness_tier: ReadinessTier;
  muscles: string[];
  exercises: TrainingExercisePlan[];
  reasons: TrainingReason[];
  alternatives: TrainingAlternative[];
  score: number;
  confidence: number;
  generated_at: string;
  model_version: string;
  strain_insight?: {
    title: string; date: string; actual_strain: number; expected_strain: number;
    delta_pct: number; verdict: string; from_cycle?: boolean; blend_weight: number;
  } | null;
  insights?: InsightsContext | null;
}

interface RecommendationResponse {
  recommendation?: TrainingRecommendation;
  generated?: boolean;
  error?: string;
}

export async function getTodayTrainingRecommendation(force = false): Promise<TrainingRecommendation | null> {
  const { data, error } = await supabase.functions.invoke<RecommendationResponse>('training-recommendation', {
    body: { action: 'today', force, force_whoop: force },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.recommendation ?? null;
}

export async function sendRecommendationFeedback(
  recommendationId: string,
  feedbackAction: 'accepted' | 'modified' | 'skipped' | 'completed',
  extra?: { chosenMuscles?: string[]; completedWorkoutId?: string; notes?: string },
) {
  const { error } = await supabase.functions.invoke('training-recommendation', {
    body: {
      action: 'feedback',
      recommendation_id: recommendationId,
      feedback_action: feedbackAction,
      chosen_muscles: extra?.chosenMuscles ?? [],
      completed_workout_id: extra?.completedWorkoutId,
      notes: extra?.notes,
    },
  });

  if (error) throw error;
}

// Reads the persisted strain-cost model + latest session insight so the AI
// coach can talk about "your last session cost X vs ~Y expected". RLS scopes
// both tables to the signed-in user automatically.
export async function getStrainCostContext(): Promise<StrainCostContext | null> {
  const [modelRes, snapRes] = await Promise.all([
    supabase.from('user_training_models').select('coefficients, n_samples, quality').eq('model_name', 'strain_cost').maybeSingle(),
    supabase.from('athlete_daily_snapshots').select('strain_insight').order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const model = modelRes.data as { coefficients?: StrainCostContext['coef']; n_samples?: number; quality?: { blendWeight?: number } } | null;
  const insight = (snapRes.data as { strain_insight?: StrainCostContext['insight'] } | null)?.strain_insight ?? null;
  if (!model && !insight) return null;
  return {
    coef: model?.coefficients,
    n: model?.n_samples,
    blend: model?.quality?.blendWeight,
    insight,
  };
}

// Reads the daily data-driven insights bundle (recovery forecast, sleep debt,
// optimal strain target, overreaching warning) for the coach. RLS-scoped.
export async function getInsightsContext(): Promise<InsightsContext | null> {
  const { data } = await supabase
    .from('athlete_daily_snapshots')
    .select('insights')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const insights = (data as { insights?: InsightsContext } | null)?.insights;
  return insights && Object.keys(insights).length ? insights : null;
}

// Reads the persisted recovery dose-response insight so the coach can explain
// how the user's recovery responds to strain + sleep. RLS-scoped.
export async function getRecoveryContext(): Promise<RecoveryContext | null> {
  const { data } = await supabase
    .from('athlete_daily_snapshots')
    .select('recovery_insight')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const insight = (data as { recovery_insight?: RecoveryContext['insight'] } | null)?.recovery_insight ?? null;
  return insight ? { insight } : null;
}
