// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import tileColors from '@/shared/wordle-style/tileColors.module.css'
import type { TileColor } from '../lib/colors'
import { BLANK } from '../lib/setup'
import styles from './Tile.module.css'

/** What a tile wears on or around it. */
type TileMarks = {
  // Sent and waiting on the server: the letters stay, dimmed.
  isInFlight: boolean
  // Its row just landed: it turns over to its color.
  isFlipping: boolean
  // How long after its row's first tile this one starts to turn.
  flipDelaySec: number
}

/**
 * One letter on wordleone's board. It is inert — a rendered guess, never a
 * control — so it takes the shared tile FACE and none of the shared
 * interaction chrome.
 *
 * A judged tile wears its color class. A tile with a letter but no judgment
 * (typed, or sent and waiting) is `filled`; an empty one wears only the grid's
 * tokens, which are what an empty slot looks like. A typed blank (`BLANK`) is
 * filled too, its glyph in the placeholder's ink: the slot is taken, by a
 * letter not yet settled.
 */
export function Tile({
  letter,
  color,
  marks,
}: {
  // Upper-cased here; empty for an empty slot; `BLANK` for a typed blank.
  letter: string
  color: TileColor
  marks: TileMarks
}) {
  const isFilled = letter !== '' && color === 'blank'
  return (
    <div
      className={cls(
        shared.tileFace,
        styles.tile,
        color !== 'blank' && tileColors[color],
        marks.isFlipping && styles.reveal,
        isFilled && styles.filled,
        letter === BLANK && styles.blankLetter,
        marks.isInFlight && styles.inFlight,
        marks.isInFlight && shared.dimInFlight,
      )}
      style={marks.isFlipping
        ? { animationDelay: `${marks.flipDelaySec}s` }
        : undefined}
      role="gridcell"
    >
      <span className={styles.letter}>{letter.toUpperCase()}</span>
    </div>
  )
}
