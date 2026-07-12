/**
 * wordiply's scoring — the FE port of the server's math. Both the length
 * score and the compete comparator MUST match `wordiply._length_score` and
 * `wordiply._finish_compete` in the migration bit-for-bit, because the
 * server is authoritative and the FE only mirrors it for live display.
 *
 * Per the "length only during play" rule, none of this is SHOWN until
 * terminal — but it's computed here so the terminal readouts + the compete
 * ordering render without another round-trip.
 */

/**
 * The length-bar percentage: `round(100 * longest / maxLen)`, clamped to
 * [0, 100]. `longest` is the longest guess (in a track); `maxLen` is the
 * board's `max_word_length`. Mirrors `wordiply._length_score`.
 */
export function lengthScore(longest: number, maxLen: number): number {
  if (maxLen <= 0) return 0
  return Math.min(100, Math.round((100 * longest) / maxLen))
}

/** The sum of the lengths of every guess in a track — the "letter count"
 *  readout. Takes the raw lengths so callers can pass `guesses.map(g => g.length)`. */
export function letterCount(lengths: readonly number[]): number {
  return lengths.reduce((sum, n) => sum + n, 0)
}

/** One competitor's terminal totals, as the comparator needs them. */
export type Competitor = {
  length_score: number
  letter_count: number
  /** ISO timestamp of this player's last guess, or null if they never
   *  guessed. Only consulted when the game is `timed`. */
  finished_at: string | null
}

/**
 * The lexicographic comparator — returns <0 when `a` ranks ABOVE `b` (so
 * `Array.prototype.sort` puts the leader first). MUST match the ordering
 * in `wordiply._finish_compete`:
 *   1. higher length score wins
 *   2. tie → higher letter count wins
 *   3. still tied AND the game is timed → earlier finish wins
 *   4. still tied → equal (co-leaders)
 */
export function compareCompetitors(a: Competitor, b: Competitor, timed: boolean): number {
  if (a.length_score !== b.length_score) return b.length_score - a.length_score
  if (a.letter_count !== b.letter_count) return b.letter_count - a.letter_count
  if (timed && a.finished_at && b.finished_at) {
    return a.finished_at.localeCompare(b.finished_at) // earlier ISO string first
  }
  return 0
}
