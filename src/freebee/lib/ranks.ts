/**
 * FreeBee rank ladder — TypeScript port of
 * `~/freebee-ws/shared/ranks.js`.
 *
 * 7 rank tiers from Start (0%) to Genius (70%). Other ranks
 * spread linearly between 0 and GENIUS_AT. The same constants
 * drive:
 *   - The FE's <RankBar> visualization.
 *   - The compete-mode "first to target_rank wins" check in
 *     `freebee.submit_word` (Phase 2 RPC). The RPC's
 *     `freebee._rank_idx` computes the same number via integer
 *     math; the formula `(score * 60) / (total * 7)` is the
 *     algebraic rearrangement of this file's
 *     `score >= rankThreshold(i) * total` — derived to avoid
 *     PL/pgSQL floating point.
 *
 * Keep the two implementations in lockstep. If either set of
 * constants moves, walk the other to match.
 */

export const RANKS = [
  'Start',
  'Good',
  'Solid',
  'Nice',
  'Great',
  'Amazing',
  'Genius',
] as const

/** Score-fraction at which "Genius" is reached. Other ranks are
 *  spaced linearly between 0 and this value. NYT's bee uses the
 *  same 70% threshold; we keep parity for familiarity. */
export const GENIUS_AT = 0.7

/** Fraction-of-max-score that unlocks rank `i`. Returns 0 for
 *  Start, GENIUS_AT (0.7) for Genius, linearly in between. */
export function rankThreshold(i: number): number {
  return (i / (RANKS.length - 1)) * GENIUS_AT
}

/** Absolute score that unlocks rank `i` given the puzzle's
 *  total possible score. `Math.ceil` so the displayed "needs N
 *  points" matches the surfaceable integer; the actual win check
 *  uses `>=` so a player at exactly the ceil'd threshold counts
 *  as having unlocked the rank. */
export function rankPoints(i: number, total: number): number {
  return Math.ceil(rankThreshold(i) * total)
}

/** Highest rank index whose threshold is reached at this score.
 *  Returns 0 (Start) when total is 0 or score is 0; clamps to
 *  the top of RANKS for scores beyond Genius (a full clear of
 *  the scoring set produces ~143% of GENIUS_AT, since GENIUS_AT
 *  is the 70% mark — clamping is what keeps the bar at Genius). */
export function currentRankIndex(score: number, total: number): number {
  if (!total) return 0
  const ratio = score / total
  let idx = 0
  for (let i = 0; i < RANKS.length; i++) {
    if (ratio >= rankThreshold(i)) idx = i
  }
  return idx
}
