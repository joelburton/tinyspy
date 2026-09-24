// cs-unmet

import { useBoundAction } from '@/common/actions/useBoundAction'
import type { ArrowKey } from './gridCursor'
import { stepCell, type BoardShape, type Cell } from './stepCell'
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
}

export type BoardSelectionCursor = {
  // The cell to draw the cursor on, or null when it is not drawn.
  cursor: Cell | null
  // A click on a cell: the cursor goes there and hides.
  point: (cell: Cell) => void
}

/**
 * A board's **selection cursor**: arrows move it over the board's cells, and
 * Space picks the piece under it. It is the alternative to clicking, so it
 * follows `useSelectionCursor`'s rules — hidden until an arrow asks, the first
 * arrow only showing it, a click moving it and hiding it.
 *
 * It binds two actions, `act-move-cursor` and `act-toggle-tile`. **The commit
 * is the game's own**: its Submit is an action with Enter on it, bound beside
 * the button it draws, and it acts whether or not the cursor shows — it commits
 * the selection, which is always drawn, so a click followed by Enter makes the
 * move. **Space acts on the cursor, so it is inert while the cursor is hidden.**
 *
 * What stays in the game is the board's shape, what a pick is, and the move.
 * The arrows go where `stepCell` says.
 */
export function useBoardSelectionCursor({
  shape,
  enabled,
  onToggle,
}: BoardSelectionCursorOptions): BoardSelectionCursor {
  const selection = useSelectionCursor<Cell>({ x: 0, y: 0 })
  const state = () => (enabled ? 'active' : 'disabled')

  useBoundAction('act-move-cursor', {
    describe: state,
    run: (key) => selection.step(stepCell(selection.at, key as ArrowKey, shape)),
  })

  useBoundAction('act-toggle-tile', {
    describe: state,
    run: () => {
      if (selection.revealed) onToggle(selection.at)
    },
  })

  return {
    cursor: enabled && selection.revealed ? selection.at : null,
    point: selection.point,
  }
}
