// cs-unmet

import { makeCellId } from '../lib/cellId'
import type { GBoard, GPuzzleCell, GPuzzleState, GPuzzleTemplate } from '../types'

/**
 * What the printers and the .ipuz writer draw: the puzzle, with every cell
 * holding what it reads now — a given's printed letter, or the board's fill,
 * its pencil and its edge marks. Built at click time from the board as drawn
 * (common/pdf/doc.md).
 */
export function makePrintState(puzzle: GPuzzleTemplate, board: GBoard): GPuzzleState {
  const cells = puzzle.cells.map((row, r) =>
    row.map((t, c): GPuzzleCell => {
      if (t.kind === 'block') return t
      const given = t.given === true
      // A given has no place on the board.
      const live = given ? undefined : board.cellsById[makeCellId(r, c)]
      return {
        kind: 'cell',
        number: t.number,
        fill: given ? (t.fill ?? null) : (live?.fill ?? null),
        ...(t.circled ? { circled: true } : {}),
        ...(t.shaded ? { shaded: true } : {}),
        ...(given ? { given: true } : {}),
        ...(live?.pencil ? { pencil: true } : {}),
        ...(live?.markRight ? { markRight: live.markRight } : {}),
        ...(live?.markBottom ? { markBottom: live.markBottom } : {}),
      }
    }),
  )
  return { meta: puzzle, snapshot: { version: 0, cells } }
}
