// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/** What this screen knows about a tile, beyond the tile itself. */
type TileMarks = {
  // A letter of the chain on show.
  isCovered: boolean
  // A letter of the word being typed.
  isInWord: boolean
  // The typed word's last letter: clicking it again submits.
  isLast: boolean
  // In the word just refused: the letter shakes.
  isShaking: boolean
}

/**
 * One letter of the box, drawn as a tile at its place on the square. Board
 * decides which marks it wears and whether a click lands; this draws them.
 *
 * `x` and `y` are the tile's center, as a share of the square — the same
 * 0–100 numbers the board's SVG lines are drawn in, so the two layers cannot
 * drift.
 */
export function Tile({
  tile,
  x,
  y,
  marks,
  isInteractive,
  isPickable,
  onClick,
}: {
  tile: GTile
  x: number
  y: number
  marks: TileMarks
  // The board takes moves: the tile looks pressable.
  isInteractive: boolean
  // A click lands: the board takes moves, and this letter may follow the
  // word's last one (or is that last one, which submits). A letter that may
  // not follow still LOOKS pressable — see Board.tsx for why it isn't dimmed.
  isPickable: boolean
  onClick: (tile: GTile) => void
}) {
  return (
    <div
      data-tile={tile.id}
      className={cls(
        styles.tile,
        marks.isCovered && styles.covered,
        marks.isInWord && styles.inWord,
        marks.isLast && styles.last,
        !isInteractive && styles.inert,
        marks.isShaking && shared.verdictShake,
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={() => {
        if (isPickable) onClick(tile)
      }}
    >
      {tile.letter}
    </div>
  )
}
