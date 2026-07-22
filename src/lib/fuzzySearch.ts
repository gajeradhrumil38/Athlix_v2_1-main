/**
 * Multi-tier fuzzy scorer used for exercise search.
 *
 * Tiers (highest wins):
 *   1000 – exact match
 *    900 – name starts with query
 *    700 – name contains query (substring)
 *    650 – any word in name starts with query
 *    600 – all query tokens are prefixes of some name token
 *    550 – acronym match  (bp → bench press, ohp → overhead press)
 *    400 – all query tokens match name tokens with ≤1 typo each
 *    200 – partial token match
 *    0–99 – trigram similarity fallback
 *      0  – no detectable relation
 */

const editDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
};

const getTrigramSet = (s: string): Set<string> => {
  const set = new Set<string>();
  const padded = `  ${s}  `;
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
};

const trigramSimilarity = (a: string, b: string): number => {
  const sa = getTrigramSet(a);
  const sb = getTrigramSet(b);
  let intersection = 0;
  sa.forEach((t) => { if (sb.has(t)) intersection++; });
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const tokenise = (s: string) => s.split(/[\s\-_/]+/).filter(Boolean);

export const fuzzyScore = (rawQuery: string, name: string): number => {
  const q = rawQuery.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q) return 1;

  // Tier 1: exact
  if (n === q) return 1000;

  // Tier 2: name starts with full query
  if (n.startsWith(q)) return 900 + q.length;

  // Tier 3: name contains query (substring)
  if (n.includes(q)) return 700;

  const nTokens = tokenise(n);
  const qTokens = tokenise(q);

  // Tier 4: any single name-word starts with the whole query (e.g. "curl" → "Bicep Curl")
  if (nTokens.some((nt) => nt.startsWith(q))) return 650;

  // Tier 5: all query-words are prefixes of some name-word (multi-word prefix)
  if (qTokens.every((qt) => nTokens.some((nt) => nt.startsWith(qt)))) return 600;

  // Tier 6: acronym — first letters of each name-word ("bp" → "bench press")
  const acronym = nTokens.map((t) => t[0] ?? '').join('');
  if (acronym === q || acronym.startsWith(q)) return 550;

  // Tier 7: typo-tolerant token matching
  // Allow 1 error per 4 chars (min 1) so "bech" matches "bench", "sqaut" matches "squat"
  const tokenMatchScores = qTokens.map((qt) => {
    if (nTokens.some((nt) => nt.startsWith(qt))) return 1;
    const maxErr = Math.max(1, Math.floor(qt.length / 4));
    const best = Math.min(...nTokens.map((nt) => editDistance(qt, nt)));
    if (best <= maxErr) return 1 - best / (maxErr + 1);
    return 0;
  });

  const matched = tokenMatchScores.filter((s) => s > 0).length;
  if (matched === qTokens.length) {
    return 400 + tokenMatchScores.reduce((a, b) => a + b, 0) * 40;
  }
  if (matched > 0) {
    return 200 + (matched / qTokens.length) * 150;
  }

  // Tier 8: trigram fallback (catches transpositions and heavy misspellings)
  const sim = trigramSimilarity(q, n);
  if (sim > 0.15) return sim * 90;

  return 0;
};

/** Filter and rank a list of items by fuzzy score, dropping score=0. */
export const fuzzyFilter = <T>(
  items: T[],
  query: string,
  getName: (item: T) => string,
  limit = 50,
): T[] => {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, getName(item)) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
};
