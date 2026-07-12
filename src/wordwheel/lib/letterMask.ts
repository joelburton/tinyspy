/**
 * 26-bit letter mask helpers for wordwheel.
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
 * NOTE the multiset caveat: the wheel's tiles can DUPLICATE a letter,
 * and a mask collapses multiplicity — so masks answer set questions
 * only. The FE's actual game checks (tile spending in <Wheel>, the
 * per-character dim in <TypedWord>, explainReject) therefore count
 * letters instead of masking them; these helpers are kept as the
 * FE twin of the edge function's mask helpers (which still use the
 * subset test to pre-filter candidates before the count check).
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

/** Population count for a 26-bit mask — the "how many distinct
 *  letters?" question. */
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
