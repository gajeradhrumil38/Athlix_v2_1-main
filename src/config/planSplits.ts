// Ready-made splits for the coach's Assign sheet. Plain data — edit freely.
// Names match what Athlix users actually log, so a trainee's last weights
// prefill when they've done the exercise before.
export interface PlanSplit { key: 'full' | 'upper_lower' | 'ppl'; name: string; blurb: string; days: { label: string; exercises: string[] }[]; }

export const PLAN_SPLITS: PlanSplit[] = [
  {
    key: 'full', name: 'Full body', blurb: '1 day · whole body',
    days: [{ label: '', exercises: ['Barbell Back Squat', 'Bench Press', 'Seated Cable Row', 'Dumbbell Shoulder Press', 'Romanian Deadlift', 'Leg Raises'] }],
  },
  {
    key: 'upper_lower', name: 'Upper / Lower', blurb: '2 days',
    days: [
      { label: 'Upper', exercises: ['Bench Press', 'Lat Pulldown', 'Dumbbell Shoulder Press', 'Seated Cable Row', 'Dumbbell Curl', 'Tricep Pushdown'] },
      { label: 'Lower', exercises: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raises'] },
    ],
  },
  {
    key: 'ppl', name: 'Push / Pull / Legs', blurb: '3 days',
    days: [
      { label: 'Push', exercises: ['Bench Press', 'Incline Bench Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Tricep Pushdown'] },
      { label: 'Pull', exercises: ['Lat Pulldown', 'Seated Cable Row', 'T-Bar Row', 'Hammer Curl', 'Dumbbell Curl'] },
      { label: 'Legs', exercises: ['Barbell Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Calf Raises'] },
    ],
  },
];
