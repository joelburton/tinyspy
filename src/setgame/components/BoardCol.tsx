// cs-unmet

import { cls } from '@/common/utils/cls'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import type { Card as CardCode } from '../lib/cards'
import type { FlashKind } from '../lib/flash'
import { Board } from './Board'
import { Counts } from './Counts'
import { countsFor } from '../lib/readouts'
import shared from '@/common/game-page/PlayArea.module.css'
import history from '@/common/turn-log/historyViewer.module.css'
import styles from './PlayArea.module.css'

type Props = {
  board: readonly CardCode[]
  selected: readonly CardCode[]
  hinted: readonly CardCode[]
  flashes: ReadonlyMap<CardCode, FlashKind>
  disabled: boolean
  /** Turn-by-turn coop, someone else's turn — fades the table. See `Board`. */
  waiting: boolean
  // ── The mobile status bar's contents ──
  isCompete: boolean
  teamFound: number
  deckLeft: number
  hintsUsed: number
  /** Ask for a hint. The SAME binding the info column places, so the two copies
   *  can't come to say different things — including the gray "No hints when
   *  competing" face, which the action carries. */
  actHint: BoundAction
  onCardClick: (card: CardCode) => void
  /** PlayArea's below-board slot — a claim's result, the terminal verdict,
   *  "you're out", or the your-turn prompt. */
  localFeedbackSlot: FeedbackSlot
  // ── Turn-history viewer ──
  /** The viewed turn's one-line description (drives the banner over the
   *  pill slot), or null when live. */
  viewingDescription: string | null
  onExitViewing: () => void
}

/**
 * setgame's board column: the table, and one fixed-height row beneath it.
 *
 * That row is the whole below-board apparatus, and it is much smaller than most
 * games' because setgame has **no text entry at all** — no typed word, no move
 * row, no on-screen keyboard. A claim is three cards; there is nothing to echo
 * back. What the row does carry is the feedback pill: your own verdict, the
 * terminal result, or (in turn-by-turn coop) the prompt that it is your move
 * — and, while a past turn is open, the shared history banner over it.
 *
 * Fixed height, empty or not. The pill comes and goes constantly during play,
 * and a collapsing row would bounce the board on every claim.
 *
 * Above the board sits the shared `<MobileStatusBar>`, which is `display: none`
 * on desktop and costs nothing there. Below the breakpoint the whole info column
 * is off-canvas in the `<InfoSheet>`, so without it a player has to open a sheet
 * to read their own score — and, in this game, to ask for a hint. **The hint
 * button is duplicated there on purpose**: asking is a routine move here, not a
 * rescue, and routine moves belong on the play surface. Both copies are the same
 * BOUND ACTION, so they cannot come to say different things.
 */
export function BoardCol({
  board,
  selected,
  hinted,
  flashes,
  disabled,
  waiting,
  isCompete,
  teamFound,
  deckLeft,
  hintsUsed,
  actHint,
  onCardClick,
  localFeedbackSlot,
  viewingDescription,
  onExitViewing,
}: Props) {
  const viewing = viewingDescription !== null
  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <Counts items={countsFor('mobile', { isCompete, teamFound, deckLeft, hintsUsed })} />
          {/* Rendered in compete too, disabled and saying why — the same call
              the info column's copy makes, for the same reason: a button that
              vanishes leaves a player hunting for a feature they know exists. */}
          <ActionButton action={actHint} show="icon" />
        </div>
      </MobileStatusBar>

      <Board
        board={board}
        selected={selected}
        hinted={hinted}
        flashes={flashes}
        disabled={disabled}
        waiting={waiting}
        onCardClick={onCardClick}
      />
      {/* `bannerHost` only WHILE VIEWING — the banner is `position: absolute;
          inset: 0` and needs a positioning context; conditional so a `position`
          this row doesn't otherwise want isn't sitting on it during play (the
          same call connections / psychicnum make). */}
      <div className={cls(styles.pillSlot, viewing && history.bannerHost)}>
        {viewing && (
          <div className={history.banner} onClick={onExitViewing} title="Click to exit">
            <span className={history.bannerLabel}>{viewingDescription}</span>
            <button
              type="button"
              className={history.bannerExit}
              onClick={(e) => {
                e.stopPropagation()
                onExitViewing()
              }}
              aria-label="Exit viewing"
            >
              ✕
            </button>
          </div>
        )}
        <FeedbackPill slot={localFeedbackSlot} />
      </div>
    </div>
  )
}
