import { describe, expect, it } from 'vitest';
import { settleColumns } from './masonry';

const h = (m: Record<string, number>) => (id: string) => m[id] ?? 0;

describe('settleColumns', () => {
  it('moves the bottom card of the tallest column into a big gap', () => {
    const out = settleColumns([['a'], ['b', 'c', 'd']], h({ a: 100, b: 100, c: 100, d: 100 }), 0);
    expect(out).toEqual([['a', 'd'], ['b', 'c']]);
  });
  it('leaves columns alone when a move would not shorten the page', () => {
    const cols = [['a'], ['b', 'c']];
    expect(settleColumns(cols, h({ a: 100, b: 100, c: 300 }), 0)).toEqual(cols);
  });
  it('takes cards off the bottom only, keeping the top card in place', () => {
    const out = settleColumns([['a'], ['top', 'mid', 'bottom']], h({ a: 50, top: 400, mid: 400, bottom: 100 }), 0);
    expect(out).toEqual([['a', 'bottom', 'mid'], ['top']]);
  });
  it('never empties a column', () => {
    expect(settleColumns([[], ['a']], h({ a: 500 }), 0)).toEqual([[], ['a']]);
  });
  it('is a no-op with one column', () => {
    expect(settleColumns([['a', 'b']], h({ a: 1, b: 1 }))).toEqual([['a', 'b']]);
  });
  it('counts the gap between cards', () => {
    // Without the gap a→col0 would look like a win (300 vs 310); with 20px gaps it is not.
    const cols = [['x'], ['y', 'z']];
    expect(settleColumns(cols, h({ x: 290, y: 150, z: 150 }), 20)).toEqual(cols);
  });
});
