import { describe, expect, it } from 'vitest';
import { checkProgression, planDraftFromAi, withNewWeight } from './traineeAiActions';
import type { TraineeDashboard, TraineeWorkout } from './coachData';
import type { AssignedPlan } from './assignedPlans';

const wo = (date: string, w: number): TraineeWorkout => ({ id: date, date, title: 'x', duration_minutes: null, muscle_groups: null, source_plan_id: null, exercises: [{ name: 'Barbell Chest Press', muscle_group: 'Chest', sets: 3, reps: 8, weight: w, unit: 'lbs' }] });
const dash = { name: 'Sam', workouts: { shared: true, data: [wo('2026-09-01', 60), wo('2026-09-20', 65)] }, prs: { shared: true, data: [] } } as unknown as TraineeDashboard;
const plan = (id: string, created: string, names: string[]): AssignedPlan => ({
  id, title: `Plan ${id}`, created_at: created,
  exercises: names.map((name, i) => ({ name, default_sets: 3, default_reps: 8, default_weight: 60, unit: 'lbs', order_index: i, day_label: 'Day 1', rest_seconds: 90, note: null })),
} as unknown as AssignedPlan);

describe('checkProgression', () => {
  it('accepts a sensible jump and points at the newest plan with that lift', () => {
    const p = checkProgression(dash, [plan('a', '2026-08-01', ['Barbell Chest Press']), plan('b', '2026-09-01', ['Barbell Chest Press'])], 'chest press', 70);
    expect(p).toEqual({ name: 'Barbell Chest Press', from: 60, to: 70, planId: 'b', planTitle: 'Plan b' });
  });
  it('rejects a jump over 20% of their best', () => {
    expect(checkProgression(dash, [], 'Barbell Chest Press', 100)).toBeNull();
  });
  it('rejects a lift they do not do', () => {
    expect(checkProgression(dash, [], 'Deadlift', 100)).toBeNull();
  });
  it('works without a plan (offers to start one), measuring from the last session', () => {
    expect(checkProgression(dash, [], 'Barbell Chest Press', 70)).toMatchObject({ planId: null, from: 65 });
  });
  it('skips a "change" to the weight already prescribed', () => {
    expect(checkProgression(dash, [plan('a', '2026-09-01', ['Barbell Chest Press'])], 'Barbell Chest Press', 60)).toBeNull();
  });
});

describe('withNewWeight', () => {
  it('changes only the named lift and keeps day, rest and order', () => {
    const out = withNewWeight(plan('a', '', ['Barbell Chest Press', 'Row']), 'barbell chest press', 70);
    expect(out.map((e) => e.weight)).toEqual([70, 60]);
    expect(out[0]).toMatchObject({ day: 'Day 1', rest: 90, sets: 3, reps: 8 });
  });
});

describe('planDraftFromAi', () => {
  it('parses JSON wrapped in prose, snaps names, clamps numbers', () => {
    const raw = 'Sure!\n```json\n{"title":"Week 6","message":"Big week","days":[{"label":"Push","exercises":[{"name":"Barbell Chest Press","sets":40,"reps":8,"weight":70.3},{"name":"","sets":3}]},{"label":"Empty","exercises":[]}]}\n```';
    const d = planDraftFromAi(raw, dash)!;
    expect(d.title).toBe('Week 6');
    expect(d.message).toBe('Big week');
    expect(d.days).toHaveLength(1);
    expect(d.days[0].rows).toEqual([{ name: 'Barbell Chest Press', sets: 10, reps: 8, weight: 70.5, rest: 90, note: '' }]);
  });
  it('returns null for unusable output', () => {
    expect(planDraftFromAi('no json here', dash)).toBeNull();
    expect(planDraftFromAi('{"days":[]}', dash)).toBeNull();
  });
});
