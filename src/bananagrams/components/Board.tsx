// cs-unmet

import { GRID, MAX_CELL, idx } from '../lib/board'
import { ActionButton } from '@/common/actions/ActionButton'
import { blurActiveField } from '@/common/keyboard/keyboardHandoff'
import { cls } from '@/common/utils/cls'
import type { GBoardEditor } from '../reactTypes'
import { Cell } from './Cell'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Board.module.css'

/**
 * bananagrams' board: a FIXED 25×25 grid of cells in a scrolling box, which
 * fills the board column. The grid never resizes — you navigate with the zoom
 * slider and the scrollbars — so placing a tile never shifts the view. It owns
 * no input: the board editor does, and this works out what each cell shows
 * (its letter, the drop answer under a drag, the cursor) and hands it over.
 */
export function Board({ editor }: { editor: GBoardEditor }) {
  // Read once up front: the editor carries the board's scroll ref, and the
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
      const letter = ch === '.' ? null : ch
      const isLifted =
        drag !== null && drag.source.kind === 'board' && drag.source.x === x && drag.source.y === y
      const isHover = hover !== null && hover.x === x && hover.y === y
      // A tile may land on an empty cell, or back on the one it was lifted from.
      const drop = !isHover ? null : letter !== null && !isLifted ? 'blocked' : 'ok'
      cells.push(
        <Cell
          key={idx(x, y)}
          x={x}
          y={y}
          letter={letter}
          tileMarks={{ isLifted, isInvalid: invalidCells.has(idx(x, y)) }}
          cursorDir={cursor.x === x && cursor.y === y ? cursor.dir : null}
          drop={drop}
          onPointerDown={onCellPointerDown}
        />,
      )
    }
  }

  return (
    // The frame: fills the column above the fixed feedback slot; the scroll
    // box and the floating controls are positioned within it.
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
