// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import {
  BOARD_SIZE,
  CENTER,
  cellIndex,
  cellValue,
  premiumAt,
  type Cell,
  type PremiumType,
} from '../lib/board'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import gridCursor from '@/shared/board-cursor/gridCursor.module.css'
import styles from './Board.module.css'

/** A tile a player has placed this turn but not yet committed. */
export type Tentative = { letter: string; blank: boolean }
/** The keyboard-entry cursor. */
export type Cursor = { x: number; y: number; dir: 'h' | 'v' }
type XY = { x: number; y: number }

const PREMIUM_LABEL: Record<PremiumType, string> = {
  TW: 'TW',
  DW: 'DW',
  TL: 'TL',
  DL: 'DL',
  none: '',
}

/**
 * The 15×15 scrabble board. Pointer-driven, like bananagrams: each cell
 * forwards `onCellPointerDown` so BoardCol can run the shared drag gesture
 * (a press that moves becomes a drag; a press that doesn't becomes a tap
 * that moves the keyboard cursor). The board paints committed tiles,
 * not-yet-committed `tentative` tiles, the premium squares, the keyboard
 * `cursor`, the drag `hover` target, and fades the tile being dragged
 * (`dragSource`).
 */
export function Board({
  board,
  tentative,
  cursor,
  hover,
  greenCells,
  redCells,
  dragSource,
  dragging,
  isViewingHistory = false,
  historyLitCells,
  onCellPointerDown,
}: {
  board: Cell[]
  tentative: Map<number, Tentative>
  cursor: Cursor
  hover: XY | null
  // Cell indices to outline green for a beat (a just-accepted word).
  greenCells: ReadonlySet<number>
  // Cell indices to outline red for a beat (new tiles in a rejected word).
  redCells: ReadonlySet<number>
  dragSource: XY | null
  dragging: boolean
  // The board is a historical replay — it wears the shared history frame (blue,
  // see historyViewer.module.css) and takes no cursor.
  isViewingHistory?: boolean
  // Cells the viewed turn placed — outlined green (the "good words of this
  // turn"), over the warm attention face those cells already wear.
  historyLitCells?: Set<number>
  onCellPointerDown: (x: number, y: number, e: React.PointerEvent) => void
}) {
  const cells = []
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const idx = cellIndex(x, y)
      const committed = board[idx]
      const tent = tentative.get(idx)
      const premium = premiumAt(x, y)
      const lifting = !!dragSource && dragSource.x === x && dragSource.y === y
      const isHover = !!hover && hover.x === x && hover.y === y
      // Hovering an occupied square (committed, or a tentative that isn't the
      // tile being lifted) is a no-drop; an empty/own square is a good drop.
      const occupied = (!!committed || !!tent) && !lifting
      const cursorHere = cursor.x === x && cursor.y === y

      cells.push(
        <div
          key={idx}
          data-cell
          data-x={x}
          data-y={y}
          onPointerDown={(e) => onCellPointerDown(x, y, e)}
          className={cls(
            styles.cell,
            !committed && !tent && premium !== 'none' && styles[premium],
            !committed && !tent && idx === CENTER && styles.center,
            isHover && dragging && (occupied ? styles.dropNo : styles.dropOk),
          )}
        >
          {(committed || tent) &&
            (() => {
              const glyph = committed ? committed.l : tent!.letter
              const isBlank = committed ? committed.b : tent!.blank
              const val = committed
                ? cellValue(committed)
                : tent!.blank
                  ? 0
                  : cellValue({ l: tent!.letter, b: false })
              return (
                <span
                  className={cls(
                    styles.tile,
                    committed ? styles.committed : styles.tentative,
                    isBlank && styles.blank,
                    lifting && styles.lifted,
                    greenCells.has(idx) && styles.flashAccept,
                    redCells.has(idx) && styles.flashReject,
                    historyLitCells?.has(idx) && styles.historyTile,
                  )}
                >
                  <span className={styles.letter}>{glyph}</span>
                  {val > 0 && <span className={styles.value}>{val}</span>}
                </span>
              )
            })()}
          {!committed && !tent && (idx === CENTER ? '★' : PREMIUM_LABEL[premium])}
          {cursorHere && !isViewingHistory && (
            <span
              className={cls(
                gridCursor.cursor,
                styles.cursor,
                cursor.dir === 'h' ? gridCursor.cursorH : gridCursor.cursorV,
              )}
            />
          )}
        </div>,
      )
    }
  }
  // data-board is the e2e layout hook (the stable board-root selector every
  // game's mobile e2e uses); the cells keep their data-cell/-x/-y hooks.
  return (
    <div data-board className={cls(shared.boardSeal, styles.board, isViewingHistory && history.historyFrame)}>
      {cells}
    </div>
  )
}
