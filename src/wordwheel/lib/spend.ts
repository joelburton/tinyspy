// cs-unmet

/**
 * WHICH tile each use of a letter spends.
 *
 * The wheel is a multiset, so a letter can sit on two tiles and the word only
 * says HOW MANY of them are in use — not which. That is fine for a typed word
 * (the player picked no tile, so any one of them is honest) and wrong for a
 * clicked one: clicking the outer E and watching the center E take the mark is
 * the board answering a different question than the one you asked.
 *
 * So a click is recorded as a CLAIM on the tile it landed on, and the claims are
 * honored first. Everything left over falls to the tiles in render order, which
 * spends the center first — the game's own rule, since the mandatory use is the
 * one the center exists for.
 */

/** One click: the tile it landed on, named by letter + which of that letter's
 *  tiles it is in render order. Not a tile INDEX, so a shuffle can't leave a
 *  claim pointing at a seat that now holds a different letter. */
export type Claim = { letter: string; ordinal: number }

/** Each tile's ordinal among the tiles sharing its letter, in render order —
 *  so the center is ordinal 0 for its own letter, by construction. */
function ordinals(tileLetters: string[]): number[] {
  const seen = new Map<string, number>()
  return tileLetters.map((letter) => {
    const lower = letter.toLowerCase()
    const n = seen.get(lower) ?? 0
    seen.set(lower, n + 1)
    return n
  })
}

/**
 * The tile indices the typed word is spending, given what the player clicked.
 *
 * `counts` is the word's per-letter count, lower-cased. A claim beyond that
 * count is ignored rather than trimmed here — `trimClaims` is what forgets a
 * click, and it needs the word to do it.
 */
export function spentTiles(
  tileLetters: string[],
  counts: Map<string, number>,
  claims: readonly Claim[],
): Set<number> {
  const ord = ordinals(tileLetters)
  const spent = new Set<number>()

  // Claims first, oldest first, and only as many as the word still uses.
  const takenPer = new Map<string, Set<number>>()
  for (const claim of claims) {
    const lower = claim.letter.toLowerCase()
    const taken = takenPer.get(lower) ?? new Set<number>()
    if (taken.size >= (counts.get(lower) ?? 0)) continue
    taken.add(claim.ordinal)
    takenPer.set(lower, taken)
  }

  for (let i = 0; i < tileLetters.length; i++) {
    const lower = (tileLetters[i] ?? '').toLowerCase()
    if (takenPer.get(lower)?.has(ord[i] ?? 0)) spent.add(i)
  }

  // Then the rest, in render order — the center first where it carries the
  // letter, since it is ordinal 0.
  const left = new Map<string, number>()
  for (const [letter, n] of counts) left.set(letter, n - (takenPer.get(letter)?.size ?? 0))
  for (let i = 0; i < tileLetters.length; i++) {
    if (spent.has(i)) continue
    const lower = (tileLetters[i] ?? '').toLowerCase()
    const remaining = left.get(lower) ?? 0
    if (remaining <= 0) continue
    spent.add(i)
    left.set(lower, remaining - 1)
  }
  return spent
}

/**
 * Forget the clicks the word no longer has letters for — the MOST RECENT first,
 * which is the one a Backspace just took off.
 *
 * Called on every change that isn't a click, so clearing the box or recalling a
 * word drops every claim: those letters were not picked off the board, and the
 * next one that is should still land where it was clicked.
 */
export function trimClaims(claims: readonly Claim[], word: string): Claim[] {
  const left = new Map<string, number>()
  for (const ch of word.toLowerCase()) left.set(ch, (left.get(ch) ?? 0) + 1)
  const kept: Claim[] = []
  for (const claim of claims) {
    const lower = claim.letter.toLowerCase()
    const n = left.get(lower) ?? 0
    if (n <= 0) continue
    left.set(lower, n - 1)
    kept.push(claim)
  }
  return kept
}
