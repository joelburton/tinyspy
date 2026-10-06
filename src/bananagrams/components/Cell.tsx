// cs-unmet

import type { PointerEvent as ReactPointerEvent } from 'react'
import { cls } from '@/common/utils/cls'
import gridCursor from '@/common/board-cursor/gridCursor.module.css'
import { Tile } from './Tile'
import styles from './Cell.module.css'

/**
 * One cell of the board — a spot a tile is placed onto. Holding a tile, it
 * draws the tile; it wears the keyboard cursor and, under a drag, whether a
 * tile may land here.
 *
 * A press is forwarded to `onPointerDown`, so the board editor can run the
 * shared drag gesture (a press that moves is a drag; one that doesn't is a tap
 * that moves the cursor). `data-cell` / `data-x` / `data-y` are how the gesture
 * finds the cell under the pointer — keep those exact.
 */
export function Cell({
  x,
  y,
  letter,
  tileMarks,
  cursorDir,
  drop,
  onPointerDown,
}: {
  x: number
  y: number
  // The letter on it, or null while it is empty.
  letter: string | null
  tileMarks: Parameters<typeof Tile>[0]['marks']
  // The keyboard cursor's axis when it sits here; null when it doesn't.
  cursorDir: 'h' | 'v' | null
  // Under a drag: whether the dragged tile may land here; null with no drag
  // over it.
  drop: 'ok' | 'blocked' | null
  onPointerDown: (x: number, y: number, e: ReactPointerEvent) => void
}) {
  return (
    <div
      data-cell
      data-x={x}
      data-y={y}
      className={cls(styles.cell, drop === 'ok' && styles.dropOk, drop === 'blocked' && styles.dropNo)}
      onPointerDown={(e) => onPointerDown(x, y, e)}
    >
      {letter !== null && <Tile letter={letter} where="board" marks={tileMarks} />}
      {cursorDir !== null && (
        <div
          className={cls(
            gridCursor.cursor,
            styles.cursor,
            cursorDir === 'h' ? gridCursor.cursorH : gridCursor.cursorV,
          )}
        />
      )}
    </div>
  )
}
