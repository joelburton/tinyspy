// cs-unmet

import type { Category, CategoryRank } from './board'
import type { Outcome } from '../../common/lib/outcomes'

/**
 * Evaluate a 4-tile guess against the board's categories.
 * Returns `correct` (with the matched category's rank + name +
 * tiles), `oneAway` (exactly 3 of the 4 belong to a single
 * category), or `wrong`.
 *
 * This is the canonical connections evaluator. It lives in TS
 * because the connections board is publicly readable (see the
 * "FE-knows-the-answer" decision in the migration header).
 * The server's submit_guess RPC trusts the result this function
 * produces — that trust is the trade we accept under the
 * friends-only audience model in CLAUDE.md, in exchange for
 * dropping the column-grant trick and ~50 lines of PL/pgSQL.
 *
 * Pure function — no I/O, no global state. Tested in
 * evaluate.test.ts; the boundary cases (1-overlap, 2-overlap,
 * 3-overlap, 4-overlap, multi-category ties) are all pinned.
 */
/**
 * The wire vocabulary for a guess's verdict — the values stored in
 * `connections.guesses.result`, and the only place in the frontend that names
 * them. Everything downstream reads `outcome` instead.
 */
export type GuessResult = 'correct' | 'oneAway' | 'wrong'

/**
 * The three outcomes a GUESS can wear — a subset of the shared vocabulary, not
 * a parallel one, which is why it is `Extract`ed rather than spelled out: a
 * word dropped from `Outcome` cannot survive here.
 */
export type GuessOutcome = Extract<Outcome, 'won' | 'near' | 'lost'>

/**
 * The wire word → the app's own outcome vocabulary (docs/outcomes.md), which
 * already has a word for each of the three: `near` is defined there as "close —
 * one away, nearly right", written with this very case in mind.
 *
 * **This map is THE seam**, and it is the reason `GuessRow` below carries no
 * `result`. A second vocabulary threaded through the FE is what produced a
 * field named `outcome` typed as a wire word, a hand-written mapping table in
 * a docstring, and a lossy ternary at the one call site that could not keep the
 * two in step by hand (Joel, 2026-08-29).
 */
export const OUTCOME_FOR_RESULT: Record<GuessResult, GuessOutcome> = {
  correct: 'won',
  oneAway: 'near',
  wrong: 'lost',
}

/** The inverse, for the one place that sends a verdict UP. */
export const RESULT_FOR_OUTCOME: Record<GuessOutcome, GuessResult> = {
  won: 'correct',
  near: 'oneAway',
  lost: 'wrong',
}

/**
 * A guess's verdict, in the app's OWN vocabulary (docs/outcomes.md) rather than
 * the wire words `connections.guesses.result` stores. The three are the same
 * three facts — `near` is defined there as "close — one away, nearly right" —
 * and keeping one set of names is what stops every consumer writing its own
 * conversion. `RESULT_FOR_OUTCOME` in useGame does the translation, once, at
 * the RPC call that sends the verdict up.
 */
export type Evaluation =
  | {
      outcome: 'won'
      rank: CategoryRank
      name: string
      tiles: string[]
    }
  | { outcome: 'near' }
  | { outcome: 'lost' }

export function evaluateGuess(
  tiles: string[],
  categories: Category[],
): Evaluation {
  // Defensive: the BoardScreen guards submit on selection size,
  // but a short input shouldn't false-positive as 'oneAway' just
  // because all 3 happen to be in the same category.
  if (tiles.length !== 4) return { outcome: 'lost' }

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
      outcome: 'won',
      rank: bestCategory.rank,
      name: bestCategory.name,
      tiles: bestCategory.tiles.slice(),
    }
  }
  if (best === 3) return { outcome: 'near' }
  return { outcome: 'lost' }
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
