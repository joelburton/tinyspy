// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import {
  useDismissLocalFeedbackOnKey,
} from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { ActionButton } from '@/common/actions/ActionButton'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { usePickedTiles } from '../hooks/usePickedTiles'
import { useSubmitClaim } from '../hooks/useSubmitClaim'
import { useSpendHint } from '../hooks/useSpendHint'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { Board } from './Board'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/** No tiles — the marks a past turn's table wears for the live move. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * setgame's board column: the table, one fixed-height row beneath it, and the
 * move — picking tiles, the claim they make, and the hint (`usePickedTiles`,
 * `useSubmitClaim`, `useSpendHint`, `useBoardColActions`).
 *
 * The row is the whole below-board apparatus, and it is much smaller than most
 * games' because setgame has **no text entry at all** — no typed word, no move
 * row, no on-screen keyboard. A claim is three tiles; there is nothing to echo
 * back. What the row does carry is the feedback pill: your own refusal, the
 * ending, or (under turn order) the prompt that it is your move — and, while a
 * past turn is open, the shared history banner over it. Fixed height, empty or
 * not: the pill comes and goes constantly, and a collapsing row would bounce
 * the board on every claim.
 *
 * Above the board sits the shared `<MobileStatusBar>`, `display: none` on
 * desktop. On a phone the info column is off-canvas, so without it a player
 * would open a sheet to read their own count — and, in this game, to ask for a
 * hint. **The Hint button is on it too, on purpose**: asking is a routine move
 * here, not a rescue, and routine moves belong on the play surface.
 */
export function BoardCol({
  gd,
  shownTiles,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
}: {
  gd: GGameData
  // The table to show — PlayArea picks it: a past turn's, or the live one.
  shownTiles: GTile[]
  historyView: GHistoryView
  // PlayArea's below-board slot: a refused claim or hint, the ending, "you're
  // out", the your-turn prompt.
  localFeedbackSlot: FeedbackSlot
  // True for a beat as the turn becomes mine (useTurnStartFlash).
  myTurnJustStarted: boolean
}) {
  // ─── Which table is on screen ─────────────────────────────────
  // The board responds to me: the move is mine, on the live table — a click or
  // key over a past turn is the viewer's exit.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  // ─── The pending move ─────────────────────────────────────────
  // The picks, the claim they make, the hint that picks for you, and the keys.
  const picks = usePickedTiles(gd.me.board.tilesById)
  const submission = useSubmitClaim({ gd, localFeedbackSlot })
  const hint = useSpendHint({
    gd,
    setPicks: picks.set,
    submitClaim: submission.send,
    localFeedbackSlot,
  })
  const actions = useBoardColActions({
    gd,
    isInteractive,
    picks,
    inFlightTileIds: submission.inFlightTileIds,
    submitClaim: submission.send,
    spendHint: hint.spend,
    localFeedbackSlot,
  })

  // Any key is the next move, so any key drops the previous move's result.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ───────────────────────────────────────────────────

  return (
    <div className={cls(shared.boardCol, styles.boardCol)}>
      <MobileStatusBar>
        <div className={styles.mobileStatus}>
          <StateLine facts={gd.me} withTilesInDeck={false} withHints={gd.coop}/>
          {/* On the bar in compete too, disabled and saying why — the same
              action the info column places. */}
          <ActionButton action={actions.actHint} show="icon"/>
        </div>
      </MobileStatusBar>

      <Board
        tiles={shownTiles}
        marks={{
          // My picks and the hint's ring are the live table's; a past turn's
          // table rings that turn's own tiles instead.
          pickedTileIds: historyView.isViewing
            ? NO_TILES
            : new Set(picks.tileIds),
          ringTileIds: new Set((historyView.isViewing
            ? historyView.litTiles
            : hint.ringTiles).map((t) => t.id)),
          inFlightTileIds: historyView.isViewing
            ? NO_TILES
            : submission.inFlightTileIds,
          isWaitingForTurn: gd.me.waitingForTurn,
          myTurnJustStarted,
        }}
        canPick={actions.canPick}
        isViewingHistory={historyView.isViewing}
        endingOutcome={gd.me.outcome}
        lastClaim={gd.events.findLast((e) => e.kind === 'claim') ?? null}
        onPick={actions.pickTile}
      />
      {/* `bannerHost` only WHILE VIEWING — the banner is `position: absolute;
          inset: 0` and needs a positioning context; conditional so a `position`
          this row doesn't otherwise want isn't sitting on it during play. */}
      <div className={cls(styles.pillSlot,
        historyView.isViewing && history.historyBannerHost)}>
        {historyView.isViewing && <HistoryBanner label={historyView.label}
                                                 onExit={historyView.exit}/>}
        <FeedbackPill slot={localFeedbackSlot}/>
      </div>
    </div>
  )
}
