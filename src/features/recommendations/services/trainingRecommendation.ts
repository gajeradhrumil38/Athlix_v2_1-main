import { supabase } from '../../../lib/supabase';

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
