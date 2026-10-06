// cs-unmet

import { cls } from '@/common/utils/cls'
import gridCursor from '@/common/board-cursor/gridCursor.module.css'
import type { GPremiumType } from '../types'
import { Tile } from './Tile'
import styles from './Cell.module.css'

/** What a premium cell shows while it is empty. */
const PREMIUM_LABEL: Record<GPremiumType, string> = {
  TW: 'TW',
  DW: 'DW',
  TL: 'TL',
  DL: 'DL',
  none: '',
}

/**
 * One cell of the board — a spot a tile is placed onto. Empty, it shows its
 * premium (the center its star); holding a tile, it draws the tile and hides
 * the premium. It wears the keyboard cursor and, under a drag, whether a tile
 * may land here.
 *
 * A press is forwarded to `onPointerDown`, so the board column can run the
 * shared drag gesture (a press that moves is a drag; one that doesn't is a
 * tap that moves the cursor). `data-cell` / `data-x` / `data-y` are how the
 * gesture finds the cell under the pointer.
 */
export function Cell({
  x,
  y,
  premium,
  isCenter,
  tile,
  tileMarks,
  cursorDir,
  drop,
  onPointerDown,
}: {
  x: number
  y: number
  premium: GPremiumType
  isCenter: boolean
  // The tile on it — played, staged, or in a teammate's preview — or null.
  tile: { id: string; letter: string; blank: boolean } | null
  tileMarks: Parameters<typeof Tile>[0]['marks']
  // The keyboard cursor's axis when it sits here; null when it doesn't.
  cursorDir: 'h' | 'v' | null
  // Under a drag: whether the dragged tile may land here; null with no drag over it.
  drop: 'ok' | 'blocked' | null
  onPointerDown: (x: number, y: number, e: React.PointerEvent) => void
}) {
  const isEmpty = tile === null
  return (
    <div
      data-cell
      data-x={x}
      data-y={y}
      onPointerDown={(e) => onPointerDown(x, y, e)}
      className={cls(
        styles.cell,
        isEmpty && premium !== 'none' && styles[premium],
        isEmpty && isCenter && styles.center,
        drop === 'ok' && styles.dropOk,
      )}
    >
      {isEmpty
        ? (isCenter ? '★' : PREMIUM_LABEL[premium])
        : (
          <Tile
            id={tile.id}
            letter={tile.letter}
            blank={tile.blank}
            where="board"
            marks={{ ...tileMarks, isDropBlocked: drop === 'blocked' }}
          />
        )}
      {cursorDir !== null && (
        <span
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
