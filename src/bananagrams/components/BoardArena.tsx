// cs-unmet

import { GRID, MAX_CELL, LETTER_SCALE, idx } from '../lib/board'
import { ActionButton } from '@/common/actions/ActionButton'
import { blurActiveField } from '@/common/keyboard/keyboardHandoff'
import { cls } from '@/common/utils/cls'
import type { GBoardEditor } from '../reactTypes'
import shared from '@/common/game-page/playArea.module.css'
import gridCursor from '@/common/board-cursor/gridCursor.module.css'
import styles from './PlayerBoard.module.css'

/**
 * bananagrams' board-column VIEW — a FIXED 25×25 scroll arena. The grid never
 * resizes (you navigate with the zoom slider and the scrollbars), so placing a
 * tile never shifts the view. It owns no input: the board editor does, and this
 * draws what it holds and forwards the one pointer-down.
 *
 * The DOM contract is load-bearing: each cell carries `data-cell` / `data-x` /
 * `data-y` so the drag's `elementFromPoint` hit-testing (and the e2e locators)
 * can find it — keep those exact.
 */
export function BoardArena({ editor }: { editor: GBoardEditor }) {
  // Read once up front: the editor carries the arena's scroll ref, and the
  // `react-hooks/refs` rule treats every later read off a group holding a ref
  // as a read of the ref itself.
  const {
    scrollRef, board, cursor, hover, drag, invalidCells, cell, minCell,
    onZoom, onCellPointerDown, actZoomFit,
  } = editor

  const cells: React.ReactNode[] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const ch = board[idx(x, y)]
      const isHover = hover !== null && hover.x === x && hover.y === y
      const isLifting =
        drag !== null && drag.source.kind === 'board' && drag.source.x === x && drag.source.y === y
      const isBlocked = isHover && ch !== '.' && !isLifting
      const isDropOk = isHover && !isBlocked
      const isCursorHere = cursor.x === x && cursor.y === y
      cells.push(
        <div
          key={y * GRID + x}
          data-cell
          data-x={x}
          data-y={y}
          className={cls(styles.cell, isDropOk && styles.dropOk, isBlocked && styles.dropNo)}
          onPointerDown={(e) => onCellPointerDown(x, y, e)}
        >
          {ch !== '.' && (
            <div
              className={cls(
                styles.tile,
                isLifting && styles.lifted,
                invalidCells.has(idx(x, y)) && styles.tileInvalid,
              )}
            >
              {ch}
            </div>
          )}
          {isCursorHere && (
            <div
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

  return (
    // The arena frame: fills the column above the fixed feedback slot; the
    // scroll area and the floating controls are positioned within it.
    <div className={cls(shared.boardSeal, styles.boardFrame)}>
      {/* A press blurs a focused chat box, so clicking the board hands the
          keyboard back to the game (the cells are non-focusable divs). */}
      <div className={styles.boardScroll} ref={scrollRef} onPointerDown={blurActiveField}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${GRID}, ${cell}px)`,
            gridTemplateRows: `repeat(${GRID}, ${cell}px)`,
            width: GRID * cell,
            height: GRID * cell,
            fontSize: cell * LETTER_SCALE,
          }}
        >
          {cells}
        </div>
      </div>
      {/* The view controls float over the board's top-right corner: the zoom
          slider on a translucent panel, and zoom-to-fit below it. */}
      <div className={styles.controls}>
        <input
          type="range"
          className={styles.zoom}
          min={minCell}
          max={MAX_CELL}
          value={cell}
          onChange={(e) => onZoom(Number(e.target.value))}
          aria-label="Zoom"
          title="Zoom"
        />
        <ActionButton action={actZoomFit} show="icon" />
      </div>
    </div>
  )
}
