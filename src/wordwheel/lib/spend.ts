// cs-blessed-wordwheel

import type { GTile } from '../types'

/**
 * WHICH tile each use of a letter spends.
 *
 * The wheel is a multiset, so a letter can sit on two tiles and the word only
 * says HOW MANY of them are in use — not which. That is fine for a typed word
 * (the player picked no tile, so any one of them is honest) and wrong for a
 * clicked one: clicking the outer E and watching the center E take the mark is
 * the board answering a different question than the one you asked.
 *
 * So a click is recorded as a CLAIM on the tile it landed on — its id, held
 * oldest first — and the claims are honored first. Everything left over falls
 * to the tiles in the puzzle's order, which spends the center first — the
 * game's own rule, since the mandatory use is the one the center exists for —
 * and is the same whatever order the board happens to be drawn in.
 */

/**
 * The ids of the tiles the typed word is spending, given what the player
 * clicked.
 *
 * `counts` is the word's per-letter count. A claim beyond that count is
 * ignored rather than trimmed here — `trimClaims` is what forgets a click, and
 * it needs the word to do it.
 */
export function spentTileIds(
  // The puzzle's tiles, the center first.
  tiles: readonly GTile[],
  counts: ReadonlyMap<string, number>,
  claimedTileIds: readonly string[],
): Set<string> {
  const tileById = new Map(tiles.map((t) => [t.id, t]))
  const spent = new Set<string>()

  // Claims first, oldest first, and only as many as the word still uses.
  const takenPer = new Map<string, number>()
  for (const id of claimedTileIds) {
    // A claim names a tile on the board.
    const letter = tileById.get(id)!.letter
    const taken = takenPer.get(letter) ?? 0
    if (taken >= (counts.get(letter) ?? 0) || spent.has(id)) continue
    spent.add(id)
    takenPer.set(letter, taken + 1)
  }

  // Then the rest, in the puzzle's order — the center first where it carries
  // the letter.
  const left = new Map<string, number>()
  for (const [letter, n] of counts) left.set(letter, n - (takenPer.get(letter) ?? 0))
  for (const tile of tiles) {
    if (spent.has(tile.id)) continue
    const remaining = left.get(tile.letter) ?? 0
    if (remaining <= 0) continue
    spent.add(tile.id)
    left.set(tile.letter, remaining - 1)
  }
  return spent
}

/**
 * Forget the clicks the word no longer has letters for — the MOST RECENT first,
 * which is the one a Backspace just took off.
 */
export function trimClaims(
  claimedTileIds: readonly string[],
  word: string,
  tilesById: ReadonlyMap<string, GTile>,
): string[] {
  const left = new Map<string, number>()
  for (const ch of word) left.set(ch, (left.get(ch) ?? 0) + 1)
  const kept: string[] = []
  for (const id of claimedTileIds) {
    const letter = tilesById.get(id)!.letter
    const n = left.get(letter) ?? 0
    if (n <= 0) continue
    left.set(letter, n - 1)
    kept.push(id)
  }
  return kept
}
