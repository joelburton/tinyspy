// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Mark } from '@/common/board-marks/useMark'
import type { Outcome } from '@/common/outcomes/outcomes'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import shared from '@/common/game-page/playArea.module.css'
import styles from './Tile.module.css'
import type { GBoardVerdict, GTile } from '../types'

/** What this screen adds to a tile: worn on or around it, never in the blob. */
type TileMarks = {
  // In the guess being built, whoever picked it.
  isPicked: boolean
  // The picker's color, where WHOSE pick is worth saying; null where not.
  pickerColor: string | null
  isUnderCursor: boolean
  // Its guess is out with the server.
  isInFlight: boolean
  // The answer to the guess it was in: the flash first, then the head-shake
  // over the fill in the answer's outcome. Null while nothing is being judged.
  verdict: { phase: Mark<GBoardVerdict>['phase']; outcome: Outcome } | null
  // The viewed past turn guessed it: lit in what that turn was. Null when not.
  historyLit: Outcome | null
}

/**
 * One loose tile on connections' board, as a button: its word, and the marks
 * this screen adds. A tile here has no settled fact of its own — the moment
 * it has one it is in a band — so everything it wears is a mark.
 */
export function Tile({
  tile,
  marks,
  isDisabled,
  onClick,
}: {
  tile: GTile
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
      disabled={isDisabled}
      className={cls(
        shared.tileFace,
        shared.tile,
        // PICKED, whoever picked it: the border says "in the move", the ring
        // says whose.
        marks.isPicked && shared.picked,
        marks.pickerColor && styles.peerPick,
        // The answer landing here — the attention flash first, then the
        // head-shake over the verdict color the flash hands back. One mark,
        // two beats, so the phase is the whole of the ordering.
        marks.verdict?.phase === 'attention' && shared.attentionFlash,
        marks.verdict?.phase === 'answer' && shared.verdictShake,
        marks.isInFlight && shared.dimInFlight,
        // The answer fills the tile, in a PALE tier of its pill's outcome.
        marks.verdict && shared.verdictFill,
        marks.verdict && OUTCOME_TO_VERDICT_CLASS[marks.verdict.outcome],
        marks.historyLit && shared.verdictFill,
        marks.historyLit && OUTCOME_TO_VERDICT_CLASS[marks.historyLit],
        marks.historyLit && styles.historyTile,
        marks.isUnderCursor && shared.selectionCursor,
      )}
      // The ring's color arrives as an inline token; the class above is set
      // only when there is one, because a ring drawn against an undefined
      // token is an invalid declaration rather than a subtle bug.
      style={marks.pickerColor ? { ['--peer-color' as string]: marks.pickerColor } : undefined}
      onClick={onClick}
      // NOT a focus target: `preventDefault` on mousedown stops a CLICK
      // parking focus here, where the next keystroke would promote it to
      // `:focus-visible` and leave a stray ring. Nothing here needs focus —
      // tiles are clicked, and Submit is bound board-wide.
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* --len drives the shared .tileWord auto-fit. */}
      <span className={shared.tileWord} style={{ ['--len' as string]: tile.word.length }}>
        {tile.word}
      </span>
    </button>
  )
}
