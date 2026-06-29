/**
 * 26-bit letter mask helpers for spellingbee.
 *
 * Same encoding the edge function uses (and the generated
 * common.words.letter_mask column stores) — bit `n` of a number is
 * set iff letter `'a' + n` is present in the source. Storing the
 * alphabet as a bitmask lets
 * us answer "does this word use only puzzle letters?" with a
 * single bitwise op instead of a per-character scan:
 *
 *   (wordMask & ~puzzleMask) === 0    // word ⊆ puzzle
 *
 * The FE uses this for two things:
 *   1. Per-letter illegal-letter dimming in <TypedWord> — the
 *      current typed word renders character-by-character, gray
 *      for letters not in the puzzle.
 *   2. Pre-flight pangram check in the FE (the synthetic
 *      pangram is whatever word uses all 7 puzzle letters; we
 *      reuse this for the +10 bonus visual hint when typing).
 *
 * JavaScript numbers are 53-bit safe integers, which is plenty
 * for our 26-bit masks — no BigInt needed FE-side (the edge
 * function uses BigInt because it sees Postgres `bigint`
 * column values, but our consumers stay within int range).
 */

/** Lower-cases `s` and ORs each of its letters' bits into a 26-bit
 *  number. Non-letter characters silently contribute zero. */
export function letterMask(s: string): number {
  let mask = 0
  const lower = s.toLowerCase()
  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i) - 97
    if (code >= 0 && code < 26) {
      mask |= 1 << code
    }
  }
  return mask
}

/** Population count for a 26-bit mask. Used by isPangram and by
 *  any "is this letter set complete?" check. */
export function popcount26(mask: number): number {
  let m = mask
  let count = 0
  while (m !== 0) {
    count += m & 1
    m >>>= 1
  }
  return count
}

/** True iff `wordMask` uses only letters in `puzzleMask`. */
export function isSubsetMask(wordMask: number, puzzleMask: number): boolean {
  return (wordMask & ~puzzleMask) === 0
}
