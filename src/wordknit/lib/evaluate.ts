import type { Group, GroupLevel } from './board'

/**
 * Evaluate a 4-tile guess against the board's groups. Returns
 * `correct` (with the matched level + members), `oneAway`
 * (exactly 3 of the 4 belong to a single group), or `wrong`.
 *
 * This is the canonical wordknit evaluator. It lives in TS
 * because the wordknit board is publicly readable (see the
 * "FE-knows-the-answer" decision in the migration header).
 * The server's submit_guess RPC trusts the result this function
 * produces — that trust is the trade we accept under the
 * friends-only audience model in CLAUDE.md, in exchange for
 * dropping the column-grant trick and ~50 lines of PL/pgSQL.
 *
 * Pure function — no I/O, no global state. Tested in
 * evaluate.test.ts; the boundary cases (1-overlap, 2-overlap,
 * 3-overlap, 4-overlap, multi-group ties) are all pinned.
 */
export type Evaluation =
  | {
      kind: 'correct'
      level: GroupLevel
      group: string
      members: string[]
    }
  | { kind: 'oneAway' }
  | { kind: 'wrong' }

export function evaluateGuess(
  tiles: string[],
  groups: Group[],
): Evaluation {
  // Defensive: the BoardScreen guards submit on selection size,
  // but a short input shouldn't false-positive as 'oneAway' just
  // because all 3 happen to be in the same group.
  if (tiles.length !== 4) return { kind: 'wrong' }

  // Find the group with the largest overlap to the guessed tiles.
  // If anything has all 4, it's the correct group. If anything
  // has 3 of 4, it's a `oneAway` hint (the NYT signal that nudges
  // the player toward swapping one tile). Otherwise wrong.
  let best = 0
  let bestGroup: Group | null = null
  for (const g of groups) {
    const overlap = tiles.filter((t) => g.members.includes(t)).length
    if (overlap > best) {
      best = overlap
      bestGroup = g
    }
  }
  if (best === 4 && bestGroup) {
    return {
      kind: 'correct',
      level: bestGroup.level,
      group: bestGroup.group,
      members: bestGroup.members.slice(),
    }
  }
  if (best === 3) return { kind: 'oneAway' }
  return { kind: 'wrong' }
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
