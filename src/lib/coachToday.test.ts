import { describe, expect, it } from 'vitest';
import { dayRange, rankNeedsYou, weekStrip } from './coachToday';
import type { Signal } from './traineeSignals';

const sig = (level: Signal['level'], label: string): Signal => ({ id: label, level, label, fact: label, chip: label });

describe('rankNeedsYou', () => {
  it('puts high-priority trainees first and skips those with only good news', () => {
    const out = rankNeedsYou([
      { traineeId: 'a', name: 'Ann', signals: [sig('warn', 'Bench flat 3 sessions')] },
      { traineeId: 'b', name: 'Ben', signals: [sig('high', 'No session in 9 days'), sig('warn', 'Plan not started')] },
      { traineeId: 'c', name: 'Cat', signals: [sig('good', 'New PR: Squat')] },
    ]);
    expect(out.map((x) => x.traineeId)).toEqual(['b', 'a']);
    expect(out[0]).toMatchObject({ level: 'high', reasons: ['No session in 9 days', 'Plan not started'] });
  });
  it('keeps wins alongside problems and caps reasons at two', () => {
    const [x] = rankNeedsYou([{ traineeId: 'a', name: 'Ann', signals: [sig('warn', 'one'), sig('warn', 'two'), sig('warn', 'three'), sig('good', 'New PR: Bench')] }]);
    expect(x.reasons).toEqual(['one', 'two']);
    expect(x.wins).toEqual(['New PR: Bench']);
  });
  it('does not flag a trainee for info-level signals alone', () => {
    expect(rankNeedsYou([{ traineeId: 'a', name: 'Ann', signals: [sig('info', 'Row flat 3 sessions')] }])).toEqual([]);
  });
  it('breaks ties by name', () => {
    const out = rankNeedsYou([{ traineeId: 'z', name: 'Zed', signals: [sig('warn', 'x')] }, { traineeId: 'y', name: 'Amy', signals: [sig('warn', 'x')] }]);
    expect(out.map((x) => x.name)).toEqual(['Amy', 'Zed']);
  });
});

describe('weekStrip', () => {
  it('marks trained days oldest to today', () => {
    const now = new Date(2026, 9, 3, 15);
    expect(weekStrip(['2026-10-03', '2026-09-28', '2026-09-20'], now)).toEqual([false, true, false, false, false, false, true]);
  });
});

describe('dayRange', () => {
  it('spans local midnight to the next midnight', () => {
    const { startDate, endDate } = dayRange(new Date(2026, 9, 3, 15));
    expect(new Date(endDate).getTime() - new Date(startDate).getTime()).toBe(86_400_000);
    expect(new Date(startDate).getHours()).toBe(0);
  });
});
