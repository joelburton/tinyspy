// cs-unmet

import type { BoundAction } from '@/common/actions/useBoundAction'
import { stepCell, type BoardShape, type Cell } from './stepCell'
import { useBoardCursorKeys } from './useBoardCursorKeys'
import { useSelectionCursor } from './useSelectionCursor'

export type BoardSelectionCursorOptions = {
  // Which cells the board has.
  shape: BoardShape
  // May the player act on the board right now? When false the keys are
  // inert and the cursor is not drawn, but it keeps its cell, so it comes
  // back where it was.
  enabled: boolean
  // Space on the cell under the cursor: put its piece into the move, or take
  // it out. The callback does its own "can this piece be picked" check.
  onToggle: (cell: Cell) => void
  // Enter, or the Submit button: make the move. Does its own legality check.
  onCommit: () => void
  // May the commit fire right now? Narrower than `enabled`; grays the button.
  canCommit?: boolean
}

export type BoardSelectionCursor = {
  // The cell to draw the cursor on, or null when it is not drawn.
  cursor: Cell | null
  // A click on a cell: the cursor goes there and hides.
  point: (cell: Cell) => void
  // The commit binding, to place as the Submit button.
  actCommit: BoundAction
}

/**
 * A board's **selection cursor**: arrows move it over the board's cells,
 * Space picks the piece under it, and Enter commits the move. It is the
 * alternative to clicking, so it follows `useSelectionCursor`'s rules — hidden
 * until an arrow asks, the first arrow only showing it, a click moving it and
 * hiding it.
 *
 * **Space acts on the cursor, so it is inert while the cursor is hidden;
 * Enter acts on the selection, so it is not.** The selection is always drawn,
 * and a click followed by Enter makes the move.
 *
 * What stays in the game is the board's shape, what a pick is, and what the
 * move is. The keys are `useBoardCursorKeys`'s actions; the arrows go where
 * `stepCell` says.
 */
export function useBoardSelectionCursor({
  shape,
  enabled,
  onToggle,
  onCommit,
  canCommit,
}: BoardSelectionCursorOptions): BoardSelectionCursor {
  const selection = useSelectionCursor<Cell>({ x: 0, y: 0 })

  const { actCommit } = useBoardCursorKeys({
    enabled,
    onArrow: (key) => selection.step(stepCell(selection.at, key, shape)),
    onToggle: () => {
      if (selection.revealed) onToggle(selection.at)
    },
    onCommit,
    commit: 'act-submit',
    canCommit,
  })

  return {
    cursor: enabled && selection.revealed ? selection.at : null,
    point: selection.point,
    actCommit,
  }
}
