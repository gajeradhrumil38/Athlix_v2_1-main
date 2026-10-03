import { describe, expect, it, vi } from 'vitest';
vi.mock('./aiCoachFetch', () => ({ aiCoachFetch: vi.fn() }));
vi.mock('../hooks/useAiCoachKey', () => ({ DEFAULT_MODEL: 'm' }));
import { briefRequest, buildTraineeContext } from './traineeAi';
import type { TraineeDashboard } from './coachData';

const NOW = new Date('2026-10-03T12:00:00Z').getTime();
const base = (over: Partial<TraineeDashboard> = {}): TraineeDashboard => ({
  link: {} as TraineeDashboard['link'], coachNotes: '', name: 'Sam', sex: 'male',
  workouts: { shared: true, data: [] }, prs: { shared: true, data: [] }, runs: { shared: true, data: [] },
  bodyWeight: { shared: true, data: [] }, recovery: { shared: false, data: null }, sleep: { shared: false, data: null }, strain: { shared: false, data: null },
  ...over,
});

describe('buildTraineeContext', () => {
  it('lists recent workouts with sets, reps and weight, newest first', () => {
    const ctx = buildTraineeContext(base({ workouts: { shared: true, data: [
      { id: '1', date: '2026-09-20', title: 'Pull', duration_minutes: 40, muscle_groups: null, source_plan_id: null, exercises: [{ name: 'Row', muscle_group: 'Back', sets: 3, reps: 10, weight: 135, unit: 'lbs' }] },
      { id: '2', date: '2026-10-01', title: 'Push', duration_minutes: null, muscle_groups: null, source_plan_id: null, exercises: [{ name: 'Bench Press', muscle_group: 'Chest', sets: 4, reps: 8, weight: 185, unit: 'lbs' }] },
    ] } }), NOW);
    expect(ctx).toContain('Workouts, last 8 weeks (2):');
    expect(ctx.indexOf('2026-10-01 Push')).toBeLessThan(ctx.indexOf('2026-09-20 Pull'));
    expect(ctx).toContain('Bench Press 4x8 @ 185');
    expect(ctx).toContain('Pull (40 min)');
  });
  it('includes RPE when a set has one', () => {
    const ctx = buildTraineeContext(base({ workouts: { shared: true, data: [
      { id: '1', date: '2026-10-01', title: 'Push', duration_minutes: null, muscle_groups: null, source_plan_id: null, exercises: [{ name: 'Bench', muscle_group: 'Chest', sets: 1, reps: 5, weight: 185, unit: 'lbs', rpe: 9 }] },
    ] } }), NOW);
    expect(ctx).toContain('Bench 1x5 @ 185 RPE 9');
  });
  it('drops workouts older than 8 weeks', () => {
    const ctx = buildTraineeContext(base({ workouts: { shared: true, data: [
      { id: '1', date: '2026-06-01', title: 'Old', duration_minutes: null, muscle_groups: null, source_plan_id: null, exercises: [] },
    ] } }), NOW);
    expect(ctx).not.toContain('Old');
    expect(ctx).toContain('- none');
  });
  it('says when a section is not shared instead of implying no data', () => {
    const ctx = buildTraineeContext(base({ workouts: { shared: false, data: [] }, prs: { shared: false, data: [] } }), NOW);
    expect(ctx).toContain('Workouts: not shared.');
    expect(ctx).toContain('Personal records: not shared.');
  });
  it('includes shared WHOOP numbers and the coach notes', () => {
    const ctx = buildTraineeContext(base({ recovery: { shared: true, data: 62 }, coachNotes: 'Bad left knee' }), NOW);
    expect(ctx).toContain('recovery 62%');
    expect(ctx).toContain("Coach's own notes: Bad left knee");
  });
});

describe('briefRequest', () => {
  it('passes the app signals through and asks for three bullets', () => {
    const r = briefRequest('Sam', ['Bench flat for 3 sessions.'], '2026-09-28');
    expect(r).toContain('exactly 3');
    expect(r).toContain('- Bench flat for 3 sessions.');
    expect(r).toContain('2026-09-28');
  });
  it('says when there are no signals', () => {
    expect(briefRequest('Sam', [], null)).toContain('no warning signals');
  });
});
