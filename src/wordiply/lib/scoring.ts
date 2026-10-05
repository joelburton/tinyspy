// cs-unmet

/**
 * wordiply's length score, in TypeScript: `wordiply._length_score`'s formula,
 * which it MUST match exactly. The page reads every score from the blob the
 * builder wrote; this is for the test fixture, which builds that blob from
 * facts the way the builder would.
 */

/**
 * The length-bar percentage: `round(100 * longest / maxLen)`, clamped to
 * [0, 100]. `longest` is the longest word on a track; `maxLen` is the board's
 * `max_word_len`. Mirrors `wordiply._length_score`.
 */
export function computeLengthScore(longest: number, maxLen: number): number {
  if (maxLen <= 0) return 0
  return Math.min(100, Math.round((100 * longest) / maxLen))
}
