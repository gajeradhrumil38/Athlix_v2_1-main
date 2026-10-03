import type { Signal } from './traineeSignals';

// The coach's "Today" home: who needs attention, ranked, from the same
// signals the trainee page and Ask AI use.

export interface NeedsYou {
  traineeId: string;
  name: string;
  level: 'high' | 'warn';
  reasons: string[]; // up to 2 short labels, worst first
  wins: string[];    // e.g. a new PR — worth a word of praise
}

export function rankNeedsYou(items: { traineeId: string; name: string; signals: Signal[] }[]): NeedsYou[] {
  const scored = items.flatMap((it) => {
    const bad = it.signals.filter((s) => s.level === 'high' || s.level === 'warn');
    if (!bad.length) return [];
    const highs = bad.filter((s) => s.level === 'high').length;
    return [{
      traineeId: it.traineeId,
      name: it.name,
      level: (highs ? 'high' : 'warn') as NeedsYou['level'],
      reasons: [...bad].sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1)).slice(0, 2).map((s) => s.label),
      wins: it.signals.filter((s) => s.level === 'good').map((s) => s.label),
      score: highs * 3 + (bad.length - highs),
    }];
  });
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map(({ score: _score, ...rest }) => rest);
}

// Local-midnight bounds of the day containing `now`, as ISO strings.
export function dayRange(now = new Date()): { startDate: string; endDate: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Seven flags, oldest → today: did they train that day?
export function weekStrip(dates: string[], now = new Date()): boolean[] {
  const set = new Set(dates);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return set.has(ymd(d));
  });
}
