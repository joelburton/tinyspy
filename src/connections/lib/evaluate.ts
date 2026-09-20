// cs-blessed-connections

import { TILES_PER_CATEGORY, type Category, type CategoryRank } from './board'

/**
 * What a 4-tile guess turned out to be: `correct` (with the matched category's
 * rank, name and tiles), `oneAway` (exactly 3 of the 4 belong to one category),
 * or `wrong`.
 *
 * **In the WIRE word**, which is what `connections.events.result` stores and
 * what `submit_guess` takes — so a verdict travels from the evaluator to the
 * column with no translation step in between. What each is WORTH is
 * `lib/answer.ts`'s to say, and every surface asks it rather than this.
 */
export type Evaluation =
  | {
      result: 'correct'
      rank: CategoryRank
      name: string
      tiles: string[]
    }
  | { result: 'oneAway' }
  | { result: 'wrong' }

/**
 * The connections evaluator. It lives in TS because the board is public
 * (doc.md → Intro to area): `submit_guess` records the verdict this produces.
 *
 * Pure — no I/O, no global state. `evaluate.test.ts` pins the boundary cases
 * (1-, 2-, 3-, 4-overlap and multi-category ties).
 */
export function evaluateGuess(
  tiles: string[],
  categories: Category[],
): Evaluation {
  // Defensive: `BoardCol` offers Submit only at four tiles, but a short
  // input shouldn't false-positive as 'oneAway' just because all 3 happen
  // to be in the same category.
  if (tiles.length !== TILES_PER_CATEGORY) return { result: 'wrong' }

  // Find the category with the largest overlap to the guessed
  // tiles. If anything has all 4, it's the matched category.
  // If anything has 3 of 4, it's a `oneAway` hint (the NYT
  // signal that nudges the player toward swapping one tile).
  // Otherwise wrong.
  let best = 0
  let bestCategory: Category | null = null
  for (const c of categories) {
    const overlap = tiles.filter((t) => c.tiles.includes(t)).length
    if (overlap > best) {
      best = overlap
      bestCategory = c
    }
  }
  if (best === TILES_PER_CATEGORY && bestCategory) {
    return {
      result: 'correct',
      rank: bestCategory.rank,
      name: bestCategory.name,
      tiles: bestCategory.tiles.slice(),
    }
  }
  if (best === 3) return { result: 'oneAway' }
  return { result: 'wrong' }
}

/**
 * Equality on tile sets, order-insensitive. `BoardCol` uses it to refuse a
 * repeat locally ("You already tried that") before anything is sent;
 * `submit_guess` keeps the same check, and answers a repeat that slips past
 * this one as a race — nothing written, no mistake charged.
 */
export function sameTileSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const t of b) if (!set.has(t)) return false
  return true
}
