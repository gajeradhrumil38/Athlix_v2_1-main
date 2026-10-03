// Close the gaps a masonry split leaves once real card heights are known:
// while it makes the tallest column shorter, move that column's bottom card to
// the end of the shortest column. Cards only ever come off the bottom, and a
// column's top card never moves — the coach's arrangement stays recognisable.
export function settleColumns(columns: string[][], heightOf: (id: string) => number, gap = 12): string[][] {
  if (columns.length < 2) return columns;
  const next = columns.map((c) => [...c]);
  const colHeight = (c: string[]) => c.reduce((s, id, i) => s + heightOf(id) + (i ? gap : 0), 0);
  for (let guard = 0; guard < 50; guard++) {
    const heights = next.map(colHeight);
    const tall = heights.indexOf(Math.max(...heights));
    const short = heights.indexOf(Math.min(...heights));
    if (tall === short || next[tall].length < 2) break;
    const id = next[tall][next[tall].length - 1];
    const moved = heightOf(id) + gap;
    const after = heights.map((h, i) => (i === tall ? h - moved : i === short ? h + moved : h));
    if (Math.max(...after) >= heights[tall]) break;
    next[tall].pop();
    next[short].push(id);
  }
  return next;
}
