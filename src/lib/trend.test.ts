import { describe, expect, it } from 'vitest';
import { classifyTrend, ema, trendRuns } from './trend';

describe('ema', () => {
  it('starts at the first value and moves halfway each step (alpha 0.5)', () => {
    expect(ema([10, 20, 20], 0.5)).toEqual([10, 15, 17.5]);
  });
});

describe('classifyTrend', () => {
  it('marks a steady climb as up', () => {
    expect(classifyTrend([100, 110, 120, 130])).toEqual(['up', 'up', 'up', 'up']);
  });
  it('marks a steady fall as down', () => {
    expect(classifyTrend([130, 120, 110, 100])).toEqual(['down', 'down', 'down', 'down']);
  });
  it('treats changes inside the noise band as holding', () => {
    expect(classifyTrend([100, 101, 99, 100])).toEqual(['flat', 'flat', 'flat', 'flat']);
  });
  it('the first point takes the state of the second', () => {
    expect(classifyTrend([100, 150])[0]).toBe('up');
  });
  it('does not flip on one noisy week inside a climb', () => {
    const s = classifyTrend([100, 120, 140, 136, 160]);
    expect(s[3]).not.toBe('down');
  });
  it('handles zeros without dividing by zero', () => {
    expect(classifyTrend([0, 0, 0])).toEqual(['flat', 'flat', 'flat']);
    expect(classifyTrend([0, 100])[1]).toBe('up');
  });
  it('returns the single state for one point', () => {
    expect(classifyTrend([42])).toEqual(['flat']);
  });
});

describe('trendRuns', () => {
  it('groups consecutive states', () => {
    expect(trendRuns(['up', 'up', 'flat', 'flat', 'down'])).toEqual([
      { state: 'up', start: 0, end: 1 },
      { state: 'flat', start: 2, end: 3 },
      { state: 'down', start: 4, end: 4 },
    ]);
  });
});
