// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import type { GridCursor } from '@/common/board-cursor/gridCursor'
import { BOARD_SIZE, CENTER, premiumAt } from '../lib/board'
import type { GCell, GTentative } from '../types'
import { Cell } from './Cell'
import styles from './Board.module.css'

/** What the board column says about the cells, beside the cells themselves —
 *  each keyed by cell id. */
type BoardMarks = {
  // Tiles laid on the board but not played: my staged move, or a teammate's
  // shown one.
  stagedTiles: ReadonlyMap<string, GTentative>
  // The word just played, ringed green for its beat.
  justPlayedCellIds: ReadonlySet<string>
  // The new cells of a refused word, ringed red for its beat.
  refusedCellIds: ReadonlySet<string>
  // The past turn on view: the cells it placed.
  historyLitCellIds: ReadonlySet<string>
  // The staged tile a drag is carrying.
  liftedCellId: string | null
  // The cell a drag is over.
  dropCellId: string | null
}

/**
 * The 15×15 scrabble board: a `Cell` per spot, in row order. It works out
 * each cell's tile — a played one, else a staged or shown one — and which
 * marks the cell and its tile wear; the cell draws them.
 *
 * Over a past turn it wears the shared history frame and takes no cursor.
 */
export function Board({
  cells,
  marks,
  cursor,
  isViewingHistory,
  onCellPointerDown,
}: {
  cells: GCell[]
  marks: BoardMarks
  cursor: GridCursor
  isViewingHistory: boolean
  onCellPointerDown: (x: number, y: number, e: React.PointerEvent) => void
}) {
  // data-board is the e2e layout hook (the stable board-root selector every
  // game's mobile e2e uses).
  return (
    <div data-board className={cls(shared.boardSeal, styles.board, isViewingHistory && history.historyFrame)}>
      {cells.map((cell, i) => {
        const x = i % BOARD_SIZE
        const y = Math.floor(i / BOARD_SIZE)
        const staged = marks.stagedTiles.get(cell.id)
        const tile = cell.tile ?? (staged === undefined ? null : { id: cell.id, ...staged })
        const isLifted = marks.liftedCellId === cell.id
        // A tile may land on an empty cell, or back on the one it was lifted from.
        const drop = marks.dropCellId !== cell.id ? null : tile !== null && !isLifted ? 'blocked' : 'ok'
        return (
          <Cell
            key={cell.id}
            x={x}
            y={y}
            premium={premiumAt(x, y)}
            isCenter={i === CENTER}
            tile={tile}
            tileMarks={{
              isStaged: cell.tile === null,
              isLocked: cell.tile !== null,
              isLifted,
              isJustPlayed: marks.justPlayedCellIds.has(cell.id),
              isRefused: marks.refusedCellIds.has(cell.id),
              isHistoryLit: marks.historyLitCellIds.has(cell.id),
            }}
            cursorDir={!isViewingHistory && cursor.x === x && cursor.y === y ? cursor.dir : null}
            drop={drop}
            onPointerDown={onCellPointerDown}
          />
        )
      })}
    </div>
  )
}
