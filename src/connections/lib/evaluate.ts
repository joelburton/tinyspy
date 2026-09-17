// cs-fixed-outcome-fix

import type { Category, CategoryRank } from './board'

/**
 * What a 4-tile guess turned out to be: `correct` (with the matched category's
 * rank, name and tiles), `oneAway` (exactly 3 of the 4 belong to one category),
 * or `wrong`.
 *
 * **In the WIRE word**, which is what `connections.guesses.result` stores and
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
 * The canonical connections evaluator. It lives in TS because the connections
 * board is publicly readable (the "FE-knows-the-answer" decision, in the
 * migration header): `submit_guess` trusts the verdict this produces, which is
 * the trade the friends-only audience model buys us in exchange for the
 * column-grant trick and ~50 lines of PL/pgSQL.
 *
 * Pure — no I/O, no global state. `evaluate.test.ts` pins the boundary cases
 * (1-, 2-, 3-, 4-overlap and multi-category ties).
 */
export function evaluateGuess(
  tiles: string[],
  categories: Category[],
): Evaluation {
  // Defensive: the BoardScreen guards submit on selection size,
  // but a short input shouldn't false-positive as 'oneAway' just
  // because all 3 happen to be in the same category.
  if (tiles.length !== 4) return { result: 'wrong' }

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
  if (best === 4 && bestCategory) {
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
 * Equality on 4-tile guess sets, order-insensitive. Used by the
 * BoardScreen to detect duplicate guesses (you already tried
 * this exact set — show a banner, don't fire submit_guess).
 *
 * Per the FE-knows model the server doesn't enforce this —
 * we trust the FE to not submit duplicates. A race where two
 * clients both submit the same set within milliseconds would
 * count as two mistakes; for a friends-coop game where you
 * coordinate verbally, that's not a real concern.
 */
export function sameTileSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const t of b) if (!set.has(t)) return false
  return true
}
