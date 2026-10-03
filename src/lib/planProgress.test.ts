import { describe, expect, it } from 'vitest';
import type { AssignedPlan } from './assignedPlans';
import { currentPlan, dayOfSession, planProgress, type PlanSession } from './planProgress';

const NOW = new Date('2026-10-02T12:00:00').getTime();

const ex = (name: string, day: string | null) => ({
  name, default_sets: 3, default_reps: 10, default_weight: 0, unit: 'lbs', order_index: 0, day_label: day,
});

const ppl: AssignedPlan = {
  id: 'p1', trainer_id: 't', trainee_id: 'u', title: 'PPL', notes: null, status: 'active',
  created_at: '2026-09-01T00:00:00Z',
  exercises: [
    ex('Bench Press', 'Push'), ex('Lateral Raises', 'Push'),
    ex('Lat Pulldown', 'Pull'), ex('Hammer Curl', 'Pull'),
    ex('Barbell Back Squat', 'Legs'), ex('Bench Press', 'Legs'),
  ],
};

const single: AssignedPlan = { ...ppl, id: 'p2', title: 'Full', created_at: '2026-09-20T00:00:00Z', exercises: [ex('Squat', null)] };

const s = (over: Partial<PlanSession>): PlanSession => ({
  id: Math.random().toString(36), date: '2026-10-01', created_at: null, source_plan_id: 'p1',
  source_plan_day: null, exercises: [], ...over,
});

describe('dayOfSession', () => {
  it('uses the stored day when it matches a plan day', () => {
    expect(dayOfSession(ppl, s({ source_plan_day: 'pull' }))).toBe('Pull');
  });
  it('infers from exercises when no day is stored', () => {
    expect(dayOfSession(ppl, s({ exercises: [{ name: 'Lat Pulldown' }, { name: 'Hammer Curl' }] }))).toBe('Pull');
  });
  it('falls back to inference when the stored day was renamed away', () => {
    expect(dayOfSession(ppl, s({ source_plan_day: 'Old name', exercises: [{ name: 'Barbell Back Squat' }] }))).toBe('Legs');
  });
  it('breaks inference ties toward the earlier day', () => {
    expect(dayOfSession(ppl, s({ exercises: [{ name: 'Bench Press' }] }))).toBe('Push');
  });
  it('returns the empty label for a single-day plan', () => {
    expect(dayOfSession(single, s({ source_plan_id: 'p2' }))).toBe('');
  });
});

describe('planProgress', () => {
  it('suggests the first day when nothing is done', () => {
    const p = planProgress(ppl, [], NOW);
    expect(p.nextDay).toBe('Push');
    expect(p.doneToday).toBe(false);
    expect(p.days.map((d) => d.label)).toEqual(['Push', 'Pull', 'Legs']);
  });
  it('rotates to the day after the latest session', () => {
    const p = planProgress(ppl, [s({ date: '2026-09-30', source_plan_day: 'Push' }), s({ date: '2026-10-01', source_plan_day: 'Pull' })], NOW);
    expect(p.nextDay).toBe('Legs');
    expect(p.days.find((d) => d.label === 'Push')?.doneRecently).toBe(true);
    expect(p.days.find((d) => d.label === 'Legs')?.doneRecently).toBe(false);
  });
  it('wraps from the last day back to the first', () => {
    expect(planProgress(ppl, [s({ source_plan_day: 'Legs' })], NOW).nextDay).toBe('Push');
  });
  it('orders same-date sessions by created_at', () => {
    const p = planProgress(ppl, [
      s({ date: '2026-10-01', created_at: '2026-10-01T18:00:00Z', source_plan_day: 'Pull' }),
      s({ date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', source_plan_day: 'Push' }),
    ], NOW);
    expect(p.nextDay).toBe('Legs');
  });
  it('reports a session done today', () => {
    const p = planProgress(ppl, [s({ date: '2026-10-02', source_plan_day: 'Push' })], NOW);
    expect(p.doneToday).toBe(true);
    expect(p.doneTodayDay).toBe('Push');
  });
  it('does not count sessions older than 7 days as recent', () => {
    const p = planProgress(ppl, [s({ date: '2026-09-20', source_plan_day: 'Push' })], NOW);
    expect(p.days[0].doneRecently).toBe(false);
    expect(p.days[0].lastDone).toBe('2026-09-20');
    expect(p.sessionsThisWeek).toBe(0);
  });
  it('ignores sessions from another plan', () => {
    expect(planProgress(ppl, [s({ source_plan_id: 'other', source_plan_day: 'Push' })], NOW).nextDay).toBe('Push');
  });
  it('counts single-day sessions this week', () => {
    const p = planProgress(single, [s({ source_plan_id: 'p2', date: '2026-10-01' }), s({ source_plan_id: 'p2', date: '2026-09-29' })], NOW);
    expect(p.sessionsThisWeek).toBe(2);
    expect(p.nextDay).toBe('');
  });
});

describe('currentPlan', () => {
  it('picks the plan trained from most recently', () => {
    expect(currentPlan([ppl, single], [s({ source_plan_id: 'p1', date: '2026-10-01' })])?.id).toBe('p1');
  });
  it('falls back to the newest assigned plan', () => {
    expect(currentPlan([ppl, single], [])?.id).toBe('p2');
  });
  it('returns null with no plans', () => {
    expect(currentPlan([], [])).toBeNull();
  });
});
