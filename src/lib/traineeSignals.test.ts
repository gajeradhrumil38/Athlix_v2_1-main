import { describe, expect, it } from 'vitest';
import { computeSignals } from './traineeSignals';
import type { TraineeDashboard, TraineeWorkout } from './coachData';

const NOW = new Date('2026-10-03T12:00:00').getTime();
const ago = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
const wo = (n: number, ex: [string, string, number, number, number][], plan: string | null = null): TraineeWorkout => ({
  id: `${n}-${ex[0]?.[0]}`, date: ago(n), title: 'x', duration_minutes: null, muscle_groups: null, source_plan_id: plan,
  exercises: ex.map(([name, muscle_group, sets, reps, weight]) => ({ name, muscle_group, sets, reps, weight, unit: 'lbs' })),
});
const dash = (workouts: TraineeWorkout[], over: Partial<TraineeDashboard> = {}): TraineeDashboard => ({
  link: {} as TraineeDashboard['link'], coachNotes: '', name: 'Sam Lee', sex: 'male',
  workouts: { shared: true, data: workouts }, prs: { shared: true, data: [] }, runs: { shared: true, data: [] },
  bodyWeight: { shared: true, data: [] }, recovery: { shared: false, data: null }, sleep: { shared: false, data: null }, strain: { shared: false, data: null },
  ...over,
});
const ids = (d: TraineeDashboard, plans: { id: string; title: string }[] = []) => computeSignals(d, plans, NOW).map((s) => s.id);
const full = (n: number, bench: number) => wo(n, [['Bench', 'Chest', 3, 8, bench], ['Row', 'Back', 3, 8, 100], ['Squat', 'Legs', 3, 8, 150], ['Press', 'Shoulders', 3, 8, 60]]);

describe('computeSignals', () => {
  it('flags a lift that has not gone up in 3 sessions', () => {
    expect(ids(dash([full(10, 135), full(6, 135), full(2, 135)]))).toContain('flat-Bench');
  });
  it('flags a lift that slipped', () => {
    const s = computeSignals(dash([full(10, 150), full(6, 140), full(2, 120)]), [], NOW).find((x) => x.id === 'down-Bench');
    expect(s?.fact).toContain('150 → 140 → 120');
    expect(s?.visual).toEqual({ kind: 'exercise', name: 'Bench' });
  });
  it('does not flag a lift that is climbing', () => {
    expect(ids(dash([full(10, 135), full(6, 145), full(2, 155)]))).not.toContain('flat-Bench');
  });
  it('flags going quiet', () => {
    expect(ids(dash([full(9, 135)]))).toContain('quiet');
  });
  it('flags a main region left out', () => {
    const s = computeSignals(dash([wo(2, [['Bench', 'Chest', 3, 8, 135], ['Squat', 'Legs', 3, 8, 150], ['Press', 'Shoulders', 3, 8, 60]]), wo(12, [['Row', 'Back', 3, 8, 100]])]), [], NOW);
    expect(s.find((x) => x.id === 'gap-Back')?.chip).toBe('Back not trained in 12 days');
  });
  it('flags plans not started and low recovery first', () => {
    const d = dash([full(2, 135)], { recovery: { shared: true, data: 30 } });
    const out = ids(d, [{ id: 'p1', title: 'Hypertrophy' }]);
    expect(out[0]).toBe('recovery');
    expect(out).toContain('plans');
  });
  it('celebrates a PR from this week', () => {
    const d = dash([full(2, 135)], { prs: { shared: true, data: [{ exercise_name: 'Bench', best_weight: 135, best_reps: 8, achieved_date: ago(2), unit: 'lbs' }] } });
    expect(ids(d)).toContain('pr-Bench');
  });
  it('flags a big volume drop', () => {
    const ws = [full(8, 135), full(15, 135), full(22, 135), full(9, 135), full(16, 135), full(23, 135), wo(1, [['Curl', 'Biceps', 1, 10, 20]])];
    expect(ids(dash(ws))).toContain('volume');
  });
  it('says nothing about workouts that are not shared', () => {
    expect(ids(dash([], { workouts: { shared: false, data: [] } }))).toEqual([]);
  });
});
