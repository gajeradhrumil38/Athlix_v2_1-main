import { describe, expect, it } from 'vitest';
import { exerciseSeries, matchExercise, muscleSets, parseAiAnswer, weekStats } from './traineeAiVisuals';
import type { TraineeWorkout } from './coachData';

const wo = (date: string, ex: [string, string | null, number, number, number][]): TraineeWorkout => ({
  id: date, date, title: 'x', duration_minutes: null, muscle_groups: null, source_plan_id: null,
  exercises: ex.map(([name, muscle_group, sets, reps, weight]) => ({ name, muscle_group, sets, reps, weight, unit: 'lbs' })),
});

describe('parseAiAnswer', () => {
  it('pulls tags out of the text and keeps their order', () => {
    const r = parseAiAnswer('- Bench is climbing.\n[[chart:exercise:Barbell Bench Press]]\n[[stats:week]]');
    expect(r.text).toBe('- Bench is climbing.');
    expect(r.visuals).toEqual([{ kind: 'exercise', name: 'Barbell Bench Press' }, { kind: 'week' }]);
  });
  it('ignores unknown tags and duplicates, caps at three', () => {
    const r = parseAiAnswer('a [[chart:pie]] [[chart:volume]] [[chart:volume]] [[chart:bodyweight]] [[chart:muscles]] [[list:prs]]');
    expect(r.visuals.map((v) => v.kind)).toEqual(['volume', 'bodyweight', 'muscles']);
    expect(r.text).toBe('a');
  });
  it('leaves plain answers alone', () => {
    expect(parseAiAnswer('Just text.')).toEqual({ text: 'Just text.', visuals: [] });
  });
});

describe('matchExercise', () => {
  const ws = [wo('2026-09-01', [['Barbell Chest Press', 'Chest', 3, 8, 60], ['Lat Pulldown', 'Back', 3, 10, 90]])];
  it('matches exactly, ignoring case', () => expect(matchExercise(ws, 'barbell chest press')).toBe('Barbell Chest Press'));
  it('matches a shorter name the model used', () => expect(matchExercise(ws, 'Chest Press')).toBe('Barbell Chest Press'));
  it('falls back to word overlap', () => expect(matchExercise(ws, 'barbell press flat')).toBe('Barbell Chest Press'));
  it('returns null when nothing fits', () => expect(matchExercise(ws, 'Deadlift')).toBeNull());
});

describe('series', () => {
  const NOW = new Date('2026-10-03T12:00:00').getTime();
  const ws = [
    wo('2026-10-01', [['Bench', 'Chest', 4, 8, 185], ['Bench', 'Chest', 1, 5, 205]]),
    wo('2026-09-20', [['Bench', 'Chest', 3, 8, 175], ['Row', 'Back', 3, 10, 135]]),
  ];
  it('exercise series is the top weight per session, oldest first', () => {
    expect(exerciseSeries(ws, 'Bench').map((p) => p.value)).toEqual([175, 205]);
  });
  it('muscle sets count the last 7 days only', () => {
    expect(muscleSets(ws, 7, NOW)).toEqual([{ muscle: 'Chest', sets: 5 }]);
  });
  it('week stats split this week from last', () => {
    const s = weekStats(ws, NOW);
    expect(s.thisWeek).toEqual({ sessions: 1, sets: 5, volume: 4 * 8 * 185 + 5 * 205 });
    expect(s.lastWeek.sessions).toBe(1);
  });
});
