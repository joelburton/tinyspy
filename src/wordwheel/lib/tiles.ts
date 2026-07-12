/**
 * The multiset tile-spend rule, as a single boolean — the FE twin of the edge
 * function's `fitsTiles`. The wheel is a MULTISET: a letter may sit on two
 * tiles, so legality is a per-letter COUNT, not set membership — a word may use
 * a letter as many times as it has tiles for it (an off-wheel letter has zero
 * tiles, so any occurrence fails).
 *
 * Used to BLOCK submitting a word the wheel can't spell (see BoardCol's
 * `submitDisabled`): typing "FOOD" on a wheel with no F/O leaves the submit
 * affordance inert rather than accepting it and reporting "not a word" — which
 * read as "FOOD isn't in the dictionary" when the real problem is the letters
 * aren't on the wheel. (`<TypedWord>` dims those characters for the same reason;
 * this collapses that per-character judgement to the whole-word question the
 * submit gate needs.)
 */
export function wordFitsWheel(word: string, letterCounts: Map<string, number>): boolean {
  // Count occurrences as we scan so the (k+1)th use of a k-tile letter fails —
  // the first k uses stay legal (mirrors `<TypedWord>` and the edge function).
  const used = new Map<string, number>()
  for (const ch of word.toLowerCase()) {
    const n = (used.get(ch) ?? 0) + 1
    used.set(ch, n)
    if (n > (letterCounts.get(ch) ?? 0)) return false
  }
  return true
}
