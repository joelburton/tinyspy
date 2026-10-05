// cs-unmet

import { cls } from '@/common/utils/cls'
import type { GTile } from '../types'
import styles from './Tile.module.css'

/** What this screen knows about a tile, beyond the tile itself. */
type TileMarks = {
  // A found word runs through it — the spangram or a theme word — or null.
  found: 'theme' | 'spangram' | null
  // It is in the word being traced.
  isTraced: boolean
  // It is where the trace ends.
  isLast: boolean
  // A word nobody found runs through it, at the reveal.
  isMissed: boolean
  // The ringed hint covers it.
  isHinted: boolean
}

/**
 * One letter of the board: a bare button, no box. The disc under it, the
 * lines and the rings are the board's drawing layer; this draws the letter in
 * the ink the marks call for — inverted on a disc — and hands itself up on a
 * click. Board decides which marks it wears.
 */
export function Tile({
  tile,
  marks,
  isDisabled,
  onPick,
}: {
  tile: GTile
  marks: TileMarks
  // The board takes no clicks: not mine to touch, or a word in flight.
  isDisabled: boolean
  onPick: (tile: GTile) => void
}) {
  return (
    <button
      type="button"
      className={cls(
        styles.tile,
        marks.found === 'spangram' && styles.tileSpangram,
        marks.found === 'theme' && styles.tileTheme,
        marks.isTraced && styles.tileTrace,
        marks.isLast && styles.tileLast,
        marks.isMissed && styles.tileMissed,
        marks.isHinted && styles.tileHinted,
      )}
      onClick={() => onPick(tile)}
      disabled={isDisabled}
      data-tile={tile.id}
      // The letter as drawn: the capitals are CSS's.
      aria-label={tile.letter.toUpperCase()}
    >
      {tile.letter}
    </button>
  )
}
