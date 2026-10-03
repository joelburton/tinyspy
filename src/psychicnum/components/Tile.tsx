// cs-unmet

import { cls } from '@/common/utils/cls'
import { Dot } from '@/common/members/Dot'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GTile } from '../types'

/** What this screen adds to a tile: worn on or around it, never in the blob. */
type TileMarks = {
  isPicked: boolean
  isUnderCursor: boolean
  isInFlight: boolean
  // Just decided; a wrong one then shakes.
  isFlashing: boolean
  isShaking: boolean
  // The viewed past turn guessed it.
  isHistoryLit: boolean
}

/**
 * One tile on psychicnum's board, as a button: the tile as the server knows
 * it — its word, and its permanent color once guessed — the marks this screen
 * adds, and the dot of who guessed it where the board says to show one.
 */
export function Tile({
  tile,
  showGuesser,
  marks,
  isDisabled,
  onClick,
}: {
  tile: GTile
  // Draw who decided it. Worth saying only on a board the players share.
  showGuesser: boolean
  marks: TileMarks
  isDisabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      // A stable e2e hook: class names are hashed, and the floating Shuffle
      // lives inside the board root, so "a button in the board" would match it.
      data-tile={tile.id}
      className={cls(
        shared.tileFace,
        shared.tile,
        styles.tile,
        tile.outcome && styles[`decided_${tile.outcome}`],
        marks.isPicked && shared.picked,
        marks.isUnderCursor && shared.selectionCursor,
        marks.isInFlight && shared.dimInFlight,
        marks.isFlashing && shared.attentionFlash,
        marks.isShaking && shared.verdictShake,
        marks.isHistoryLit && styles.historyTile,
      )}
      disabled={isDisabled}
      aria-pressed={marks.isPicked || undefined}
      onClick={onClick}
      // Not a focus target: a click must not park focus here, or the next
      // keystroke rings the tile as `:focus-visible`. The keyboard reaches a
      // tile through the selection cursor (see connections' Board).
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* --len drives the shared .tileWord auto-fit font heuristic. */}
      <span
        className={shared.tileWord}
        style={{ ['--len' as string]: tile.word.length }}
      >
        {tile.word}
      </span>
      {/* The shared identity disc, so a color means the same player here as
          in the log and the strip; `onColor` rings it white on the saturated
          fill, where the player's own darker shade would vanish. A revealed
          secret has no decider, so no dot. */}
      {showGuesser && tile.decidedBy !== null && (
        <Dot color={tile.decidedBy.color} onColor className={styles.guesserDot} />
      )}
    </button>
  )
}
