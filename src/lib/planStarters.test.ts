import { describe, expect, it } from 'vitest';
import type { TraineeWorkout } from './coachData';
import { PLAN_SPLITS } from '../config/planSplits';
import { DEFAULT_REPS, DEFAULT_REST, DEFAULT_SETS, lastSetLookup, starterFromRecent, starterFromSplit, starterFromTemplate } from './planStarters';

const NOW = new Date('2026-10-02T12:00:00').getTime();
const w = (id: string, date: string, title: string, sets: [string, number, number][]): TraineeWorkout => ({
  id, date, title, duration_minutes: 40, muscle_groups: [], source_plan_id: null,
  exercises: sets.map(([name, weight, reps]) => ({ name, muscle_group: null, sets: 1, reps, weight, unit: 'lbs' })),
});

describe('lastSetLookup', () => {
  it('returns the top set from the most recent session with that exercise', () => {
    const last = lastSetLookup([
      w('a', '2026-09-20', 'A', [['Bench Press', 100, 8]]),
      w('b', '2026-09-28', 'B', [['Bench Press', 135, 5], ['Bench Press', 125, 8]]),
    ]);
    expect(last('bench press')).toEqual({ weight: 135, reps: 5 });
    expect(last('Squat')).toBeNull();
  });
});

describe('starterFromSplit', () => {
  it('builds named days with defaults and history weights', () => {
    const ppl = PLAN_SPLITS.find((s) => s.key === 'ppl')!;
    const st = starterFromSplit(ppl, (n) => (n === 'Bench Press' ? { weight: 135, reps: 5 } : null));
    expect(st.title).toBe('Push / Pull / Legs');
    expect(st.days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs']);
    const bench = st.days[0].rows[0];
    expect(bench).toEqual({ name: 'Bench Press', sets: DEFAULT_SETS, reps: DEFAULT_REPS, weight: 135, rest: DEFAULT_REST, note: '' });
    expect(st.days[1].rows[0].weight).toBe(0);
  });
});

describe('starterFromRecent', () => {
  it('turns distinct recent sessions into days, oldest first, max 4', () => {
    const st = starterFromRecent([
      w('1', '2026-09-30', 'Push', [['Bench Press', 135, 5], ['Bench Press', 135, 5]]),
      w('2', '2026-10-01', 'Pull', [['Lat Pulldown', 120, 10]]),
      w('3', '2026-09-10', 'Old', [['Leg Press', 300, 10]]),
    ], 'Sam', NOW)!;
    expect(st.title).toBe("Sam's program");
    expect(st.days.map((d) => d.label)).toEqual(['Push', 'Pull']);
    expect(st.days[0].rows[0]).toMatchObject({ name: 'Bench Press', sets: 2, reps: 5, weight: 135 });
  });
  it('keeps one day per repeated session (latest wins)', () => {
    const st = starterFromRecent([
      w('1', '2026-09-28', 'Push', [['Bench Press', 130, 5]]),
      w('2', '2026-10-01', 'Push', [['Bench Press', 140, 5]]),
    ], 'Sam', NOW)!;
    expect(st.days).toHaveLength(1);
    expect(st.days[0].label).toBe('');
    expect(st.days[0].rows[0].weight).toBe(140);
  });
  it('returns null with no recent sessions', () => {
    expect(starterFromRecent([w('3', '2026-09-01', 'Old', [['Leg Press', 300, 10]])], 'Sam', NOW)).toBeNull();
  });
});

describe('starterFromTemplate', () => {
  it('maps template exercises into one day', () => {
    const st = starterFromTemplate({ title: 'Arms', template_exercises: [{ name: 'Hammer Curl', default_sets: 4, default_reps: 12, default_weight: 30 }] });
    expect(st).toEqual({ title: 'Arms', days: [{ label: '', rows: [{ name: 'Hammer Curl', sets: 4, reps: 12, weight: 30, rest: DEFAULT_REST, note: '' }] }] });
  });
});
