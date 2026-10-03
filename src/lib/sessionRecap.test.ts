import { describe, expect, it } from 'vitest';
import { buildRecap, fallbackRecap, recapFacts } from './sessionRecap';
import type { TraineeDashboard, TraineeWorkout } from './coachData';
import type { WorkoutState } from '../pages/Log';

const hist = (date: string, ex: [string, number, number][]): TraineeWorkout => ({ id: date, date, title: 'x', duration_minutes: null, muscle_groups: null, source_plan_id: null, exercises: ex.map(([name, weight, reps]) => ({ name, muscle_group: 'Chest', sets: 1, reps, weight, unit: 'lbs' })) });
const before = { name: 'Sam', workouts: { shared: true, data: [hist('2026-09-20', [['Bench', 135, 8], ['Bench', 135, 8]]), hist('2026-09-10', [['Bench', 130, 8]])] }, prs: { shared: true, data: [] } } as unknown as TraineeDashboard;
const set = (weight: number, reps: number, done = true) => ({ id: `${weight}-${reps}-${Math.random()}`, weight, reps, done });
const workout = (ex: { name: string; sets: ReturnType<typeof set>[] }[]) => ({ title: 'Push', exercises: ex.map((e, i) => ({ id: String(i), muscleGroup: 'Chest', ...e })) } as unknown as WorkoutState);

describe('buildRecap', () => {
  it('compares to last time and spots a PR over history', () => {
    const r = buildRecap(workout([{ name: 'Bench', sets: [set(140, 8), set(145, 6)] }]), before);
    expect(r.exercises[0]).toMatchObject({ name: 'Bench', sets: 2, top: { weight: 145, reps: 6 }, prev: { weight: 135, reps: 8, date: '2026-09-20' }, pr: true });
    expect(r.prs).toEqual(['Bench']);
    expect(r.volume).toBe(140 * 8 + 145 * 6);
    expect(r.prevVolume).toBe(135 * 8 * 2);
  });
  it('does not call a first-ever lift a PR', () => {
    const r = buildRecap(workout([{ name: 'Dips', sets: [set(0, 12)] }]), before);
    expect(r.exercises[0]).toMatchObject({ prev: null, pr: false });
  });
  it('only counts done sets once any set is ticked', () => {
    const r = buildRecap(workout([{ name: 'Bench', sets: [set(135, 8), set(200, 1, false)] }]), before);
    expect(r.exercises[0].top.weight).toBe(135);
    expect(r.exercises[0].pr).toBe(false);
  });
});

describe('recapFacts / fallbackRecap', () => {
  it('writes the change vs last time and flags the PR', () => {
    const r = buildRecap(workout([{ name: 'Bench', sets: [set(145, 6)] }]), before);
    expect(recapFacts(r)[0]).toBe('Bench: 1 sets, top 145 lb × 6 (last time 135 × 8, +10 lb) — NEW PR');
    expect(fallbackRecap('Sam', r)).toContain('New PR on Bench');
  });
});
