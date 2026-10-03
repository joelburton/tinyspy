// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { ActionButton } from '@/common/actions/ActionButton'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import historyViewerStyles from '@/common/event-log/historyViewer.module.css'
import { usePickedTile } from '../hooks/usePickedTile'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { Board } from './Board'
import { StateLine } from './StateLine'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTileResults } from '../types'

/**
 * psychicnum's board column: the `Board`, and under it Clear and Submit, or
 * the local slot's message in their place. It builds and sends the guess; the
 * board itself — its order, its cursor, its Shuffle — is `Board`'s. See
 * docs/playarea.md.
 */
export function BoardCol({
  gd,
  tileResults,
  historyView,
  localFeedbackSlot,
  endingOutcome,
  myTurnJustStarted,
}: {
  gd: GGameData
  // The board on screen: the live results, or a past turn's (PlayArea picks).
  tileResults: GTileResults
  historyView: GHistoryView
  localFeedbackSlot: FeedbackSlot
  // Passed through to `Board`'s marks.
  endingOutcome: EndOutcome | null
  myTurnJustStarted: boolean
}) {
  // The board takes picks on my move alone, and never while a past turn is on
  // screen: a click then is the viewer's exit, and must not also pick. Submit
  // sends the pick under the same gate.
  const canPick = gd.me.onTurn && !historyView.isViewing

  const pick = usePickedTile({
    localFeedbackSlot,
    isStillPlaying: gd.me.stillPlaying,
    isViewingHistory: historyView.isViewing,
  })
  const submission = useSubmitGuess({
    gameId: gd.id,
    tileResults,
    localFeedbackSlot,
    isViewingHistory: historyView.isViewing,
  })
  const actions = useBoardColActions({
    pickedTile: pick.tile,
    canPick,
    choosePickedTile: pick.choose,
    clearPickedTile: pick.clear,
    submitGuess: submission.send,
  })

  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ────────────────────────────────────────────

  const isPhone = useIsPhone()
  const buttonShow = isPhone ? 'icon' : 'both'
  const isLocalFeedbackShown = useWatchAndGetTopFeedbackMsg(localFeedbackSlot) !== null

  return (
    <div className={shared.boardCol}>
      {/* The info column's StateLine, for a phone, where that column is
          off-canvas (see `MobileStatusBar`). */}
      <MobileStatusBar>
        <StateLine data={gd.stateLineData} />
      </MobileStatusBar>

      <Board
        tiles={{
          words: gd.puzzle.words,
          results: tileResults,
          decidedBy: gd.me.board.decidedBy,
          // The guesses on my board: the team's in coop, my own in compete.
          moveCount: gd.stateLineData.guessesUsed,
        }}
        marks={{
          pickedTile: pick.shownTile,
          inFlightGuess: submission.inFlight,
          endingOutcome,
          isWaitingForTurn: gd.me.waitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        canPick={canPick}
        // Whose dot goes on a tile is worth saying only where it can differ:
        // on one board with more than one player at it.
        isSharedBoard={gd.oneBoard && gd.players.length > 1}
        onPick={pick.choose}
      />

      {/* The slot under the board: Clear and Submit, or the local feedback
          slot's message in their place; the history banner overlays both while
          a past turn is open. */}
      <div className={styles.belowBoard}>
        <div
          className={cls(
            shared.moveAreaOrLocalFeedback,
            historyView.isViewing && historyViewerStyles.historyBannerHost,
          )}
        >
          {historyView.isViewing && (
            <HistoryBanner
              label={historyView.label}
              actor={historyView.actor}
              onExit={historyView.exit}
            />
          )}
          {isLocalFeedbackShown ? (
            <div className={shared.localFeedback}>
              <FeedbackPill slot={localFeedbackSlot} />
            </div>
          ) : (
            <div className={styles.moveArea}>
              <ActionButton action={actions.actClearPicks} show={buttonShow} />
              <ActionButton
                  action={actions.actSubmit}
                  show={buttonShow}
                  weight="primary" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
