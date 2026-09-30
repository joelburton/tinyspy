// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Actor } from '@/common/members/member'
import { Dot } from '@/common/members/Dot'
import type { Outcome } from '@/common/outcomes/outcomes'
import shared from '@/common/game-page/playArea.module.css'
import type { TileWord } from '../lib/tileResults'
import styles from './WordTile.module.css'

/** What a tile wears on or around it. */
export type WordTileMarks = {
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
 * One word on psychicnum's board, as a button: the word, its permanent color
 * once guessed, its marks, and the dot of who guessed it.
 */
export function WordTile({
  word,
  decidedOutcome,
  guesser,
  marks,
  isDisabled,
  onClick,
}: {
  word: TileWord
  decidedOutcome: Outcome | null
  // Who guessed it; undefined when nobody did (unguessed, or a revealed
  // secret) or the board names no guessers.
  guesser: Actor | undefined
  marks: WordTileMarks
  isDisabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      // A stable e2e hook: class names are hashed, and the floating Shuffle
      // lives inside the board root, so "a button in the board" would match it.
      data-tile={word}
      className={cls(
        shared.tileFace,
        shared.tile,
        styles.tile,
        decidedOutcome && styles[`decided_${decidedOutcome}`],
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
        style={{ ['--len' as string]: word.length }}
      >
        {word}
      </span>
      {/* The shared identity disc, so a color means the same player here as
          in the log and the strip; `onColor` rings it white on the saturated
          fill, where the player's own darker shade would vanish. */}
      {guesser !== undefined && (
        <Dot color={guesser.color} onColor className={styles.guesserDot} />
      )}
    </button>
  )
}
