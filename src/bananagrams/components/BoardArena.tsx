import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { GRID, MAX_CELL } from '../lib/board'
import { ZoomFitButton } from '../../common/components/buttons/ZoomFitButton'
import type { DragState } from '../../common/hooks/useDragGesture'
import {
  LETTER_SCALE,
  blurActiveField,
  type Cell,
  type Cursor,
  type DragSource,
} from '../hooks/usePlayerBoard'
import { idx } from '../lib/board'
import styles from './PlayerBoard.module.css'

/**
 * bananagrams' board-column VIEW — a FIXED 25×25 scroll arena. The grid never resizes
 * (you navigate with the zoom slider + scrollbars), so placing a tile never shifts the
 * view. Purely presentational: `usePlayerBoard` owns all the state/behaviour and hands
 * this the render inputs + the one pointer callback. It is NOT a `BoardCol` (it owns no
 * input — bananagrams' input engine spans both columns; see usePlayerBoard).
 *
 * The DOM contract is load-bearing: each cell carries `data-cell` / `data-x` / `data-y`
 * so the drag gesture's `elementFromPoint` hit-testing (and the e2e locators) can find
 * it — keep those exact.
 */
export function BoardArena({
  scrollRef,
  cell,
  minCell,
  onZoom,
  onCenterFit,
  board,
  cursor,
  hover,
  drag,
  invalidCells,
  onCellPointerDown,
}: {
  /** The scroll container ref — the engine's zoom/scroll/fit effects drive it. */
  scrollRef: RefObject<HTMLDivElement | null>
  /** Zoom = px per cell; `minCell` is the smallest (whole grid fits). */
  cell: number
  minCell: number
  onZoom: (next: number) => void
  onCenterFit: () => void
  /** The placement grid (`GRID*GRID` chars, '.' = empty). */
  board: string
  cursor: Cursor
  /** The cell the drag is hovering (drop highlight), or null. */
  hover: Cell | null
  /** The live drag state (for the "lifting this board tile" dim), or null. */
  drag: DragState<DragSource> | null
  /** Cells flagged red by a blocked winning peel. */
  invalidCells: ReadonlySet<number>
  onCellPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
}) {
  const cells: React.ReactNode[] = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const ch = board[idx(x, y)]
      const isHover = hover && hover.x === x && hover.y === y
      const lifting =
        drag && drag.source.kind === 'board' && drag.source.x === x && drag.source.y === y
      const blocked = isHover && ch !== '.' && !lifting
      const dropOk = isHover && !blocked
      const cursorHere = cursor.x === x && cursor.y === y
      cells.push(
        <div
          key={y * GRID + x}
          data-cell
          data-x={x}
          data-y={y}
          className={styles.cell + (dropOk ? ' ' + styles.dropOk : '') + (blocked ? ' ' + styles.dropNo : '')}
          onPointerDown={(e) => onCellPointerDown(x, y, e)}
        >
          {ch !== '.' && (
            <div
              className={
                styles.tile +
                (lifting ? ' ' + styles.lifted : '') +
                (invalidCells.has(idx(x, y)) ? ' ' + styles.tileInvalid : '')
              }
            >
              {ch}
            </div>
          )}
          {cursorHere && (
            <div
              className={
                styles.cursor + ' ' + (cursor.dir === 'h' ? styles.cursorH : styles.cursorV)
              }
            />
          )}
        </div>,
      )
    }
  }

  return (
    // The arena frame: fills the column above the fixed feedback slot; the scroll area +
    // floating controls are absolutely positioned within it.
    <div className={styles.boardFrame}>
      {/* onPointerDown blurs a focused chat box so clicking the board hands the keyboard
          back to the game (the cells are non-focusable divs). */}
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
      {/* Floating view controls over the board's top-right corner: the zoom slider
          (translucent panel, so the board reads through it) and the standalone square
          zoom-to-fit button below it. */}
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
        <ZoomFitButton onClick={onCenterFit} label="Fit to screen" />
      </div>
    </div>
  )
}
