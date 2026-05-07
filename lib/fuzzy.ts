/**
 * Fuzzy zone name matching — prevents near-duplicate zones.
 * Uses normalised Levenshtein distance + token overlap.
 */

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns a similarity score 0–1 (1 = identical) */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  // Prefix containment: "Cradle Descent Route" starts with "Cradle Descent"
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.9;
  // Substring containment (one name embeds the other)
  if (na.includes(nb) || nb.includes(na)) return 0.82;
  // Token overlap: fraction of shared words (Jaccard)
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const union = new Set([...ta, ...tb]).size;
  const tokenScore = union > 0 ? shared / union : 0;
  // Levenshtein character similarity
  const maxLen = Math.max(na.length, nb.length);
  const charScore = maxLen === 0 ? 1 : 1 - levenshtein(na, nb) / maxLen;
  // Return the highest of the two signals
  return Math.max(charScore, tokenScore);
}

export interface FuzzyMatch {
  name: string;
  score: number;
}

/**
 * Given a new zone name and a list of existing names in the same region,
 * returns any matches above the threshold (default 0.75).
 */
export function findSimilarZones(
  candidate: string,
  existingNames: string[],
  threshold = 0.72
): FuzzyMatch[] {
  return existingNames
    .map((name) => ({ name, score: similarity(candidate, name) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
