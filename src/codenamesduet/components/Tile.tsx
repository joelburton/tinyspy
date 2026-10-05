// cs-unmet

import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GKey, GTile } from '../types'

/**
 * GKey ('G'|'N'|'A') → the key-card square's color class. The squares always
 * use the *unrevealed* (soft) palette — they show what a key card SAYS about a
 * tile, independent of what's been guessed.
 */
const KEY_SQUARE: Record<GKey, 'keyAgent' | 'keyNeutral' | 'keyAssassin'> = {
  G: 'keyAgent',
  N: 'keyNeutral',
  A: 'keyAssassin',
}

/** What a turned-over tile SHOWS, the same for both players → its fill class.
 *  A tile nobody has guessed is `bgWhite`. */
const FILL: Record<GKey, 'bgAgent' | 'bgNeutral' | 'bgAssassin'> = {
  G: 'bgAgent',
  N: 'bgNeutral',
  A: 'bgAssassin',
}

/** What this screen adds to a tile: worn on or around it, never in the blob. */
type TileMarks = {
  isPicked: boolean
  isUnderCursor: boolean
  isInFlight: boolean
  // Just turned over; a bystander or the assassin then shakes.
  isFlashing: boolean
  isShaking: boolean
  // The viewed past turn decided it.
  isHistoryLit: boolean
}

/**
 * One tile on the codenamesduet board, as a button: its word, its fill — what
 * it shows, the same for both players — the key-card squares and the
 * bystander arrows, and the marks this screen adds. `Board` decides all of
 * them; this draws what it is handed.
 */
export function Tile({
  tile,
  myKey,
  partnerKey,
  arrowToMe,
  arrowToPartner,
  marks,
  isClickable,
  onClick,
}: {
  tile: GTile
  // My key-card square, bottom-left; null when it is not drawn.
  myKey: GKey | null
  // My partner's key-card square, top-right; null when it is not drawn.
  partnerKey: GKey | null
  // A triangle below the word, pointing down toward me; and one above,
  // pointing up toward my partner.
  arrowToMe: boolean
  arrowToPartner: boolean
  marks: TileMarks
  isClickable: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      // The tile's test handle.
      data-tile={tile.id}
      className={cls(
        shared.tileFace,
        shared.tile,
        styles.overlayTile,
        tile.revealed === null
          ? styles.bgWhite
          : styles[FILL[tile.revealed.as]],
        marks.isPicked && shared.picked,
        marks.isUnderCursor && shared.selectionCursor,
        marks.isInFlight && shared.dimInFlight,
        marks.isFlashing && shared.attentionFlash,
        marks.isShaking && shared.verdictShake,
        marks.isHistoryLit && styles.historyTile,
      )}
      disabled={!isClickable || marks.isInFlight}
      onClick={onClick}
    >
      {partnerKey !== null && (
        <span className={cls(styles.keySquare,
          styles.keyPartner,
          styles[KEY_SQUARE[partnerKey]])} aria-hidden/>
      )}
      {arrowToPartner &&
          <span className={cls(styles.triangle, styles.triPartner)}
                aria-hidden/>}
      {/* --len drives the shared .tileWord auto-fit font heuristic. */}
      <span
        className={shared.tileWord}
        style={{ ['--len' as string]: tile.puzzleTile.word.length }}
      >
        {tile.puzzleTile.word}
      </span>
      {arrowToMe &&
          <span className={cls(styles.triangle, styles.triMine)} aria-hidden/>}
      {myKey !== null && (
        <span
          className={cls(styles.keySquare,
            styles.keyMine,
            styles[KEY_SQUARE[myKey]])} aria-hidden
        />
      )}
    </button>
  )
}
