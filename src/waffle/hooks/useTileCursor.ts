// cs-unmet

import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import {
  useBoardSelectionCursor,
} from '@/common/board-cursor/useBoardSelectionCursor'
import type { Cell } from '@/common/board-cursor/stepCell'
import { BOARD_SHAPE } from '../lib/boardShape'
import { GRID } from '../lib/waffle'
import type { GTile } from '../types'

/**
 * The keyboard's way onto waffle's board: arrows move the selection cursor over
 * the tiles — passing over the four holes, which `BOARD_SHAPE` leaves out —
 * Space toggles the tile under it into or out of the picks, and a click moves
 * the cursor to the clicked tile, hidden, so the keys resume there. See
 * `useBoardSelectionCursor` for the rules every board's cursor keeps.
 *
 * A tile's id is its position, so the cell under the cursor names its tile.
 */
export function useTileCursor({
  tiles,
  isInteractive,
  onToggle,
}: {
  // The tiles on the board.
  tiles: readonly GTile[]
  // The board takes a pick right now; the cursor is inert while not.
  isInteractive: boolean
  // Space on the tile under the cursor.
  onToggle: (tile: GTile) => void
}): {
  // The id of the tile under the cursor, or null while it is hidden.
  cursorTileId: string | null
  // Move the cursor to a clicked tile, hidden.
  moveToClicked: (tile: GTile) => void
} {
  const selectionCursor = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: isInteractive,
    onToggle: (cell: Cell) => {
      const id = String(positionAt(cell.x, cell.y, GRID))
      onToggle(tiles.find((t) => t.id === id)!)
    },
  })

  const cell = selectionCursor.cell
  return {
    cursorTileId: cell ===
    null
      ? null
      : String(positionAt(cell.x, cell.y, GRID)),
    moveToClicked: (tile) => selectionCursor.setTo(cellAt(Number(tile.id),
      GRID)),
  }
}
