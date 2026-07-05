/**
 * Stable content hash for dedup of the puzzle library. Ported verbatim
 * from crossplay's `puzzleContentHash` — the dedup key MUST match its
 * definition exactly, so re-importing the same puzzle collides.
 *
 * SHA-256 over a puzzle's *solving content*: the solution grid (with
 * block shape baked in via nulls), the boolean given-mask, and normalized
 * clue text. Title / author / copyright / notes and the presentation
 * flags (circled, shaded) are intentionally excluded, so reprints with
 * cosmetic differences collide.
 */

import { createHash } from 'node:crypto'
import type { Clue, PuzzleState } from '../../../src/crosswords/lib/types'

export function puzzleContentHash(
  state: PuzzleState,
  solution: (string[] | null)[][],
): string {
  const givens = state.snapshot.cells.map((row) =>
    row.map((c) => (c.kind === 'cell' ? !!c.given : false)),
  )
  const normClues = (cs: Clue[]) =>
    cs.map((c) => [c.number, c.text.trim().normalize('NFC')] as const)
  const payload = JSON.stringify({
    solution,
    givens,
    across: normClues(state.meta.clues.across),
    down: normClues(state.meta.clues.down),
  })
  return createHash('sha256').update(payload).digest('hex')
}
