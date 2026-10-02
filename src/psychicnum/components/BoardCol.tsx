// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { ActionButton } from '@/common/actions/ActionButton'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import historyViewerStyles from '@/common/event-log/historyViewer.module.css'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import { usePickedTile } from '../hooks/usePickedTile'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useBoardColActions } from '../hooks/useBoardColActions'
import type { TileResults } from '../lib/tileResults'
import { Board } from './Board'
import { StateLine } from './StateLine'
import styles from './BoardCol.module.css'

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
  gd: GameData
  // The board on screen: the live results, or a past turn's (PlayArea picks).
  tileResults: TileResults
  historyView: HistoryView
  localFeedbackSlot: FeedbackSlot
  // Passed through to `Board`'s marks.
  endingOutcome: EndOutcome | null
  myTurnJustStarted: boolean
}) {
  // A past turn on screen blocks every write to the board.
  const canPick = gd.standing.isBoardInteractive && !historyView.isViewing
  const canSubmit = gd.standing.isMyTurn && !historyView.isViewing

  const {
    pickedTile,
    shownPickedTile,
    choosePickedTile,
    clearPickedTile,
  } = usePickedTile({
    localFeedbackSlot,
    isStillPlaying: gd.standing.isStillPlaying,
    isViewingHistory: historyView.isViewing,
  })
  const { submitGuess, inFlightGuess } = useSubmitGuess({
    gameId: gd.gameId,
    tileResults,
    localFeedbackSlot,
    isViewingHistory: historyView.isViewing,
  })
  const actions = useBoardColActions({
    pickedTile,
    canPick,
    canSubmit,
    choosePickedTile,
    clearPickedTile,
    submitGuess,
  })

  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Render ────────────────────────────────────────────

  const isPhone = useIsPhone()
  const buttonShow = isPhone ? 'icon' : 'both'
  const isLocalFeedbackShown = useTopFeedbackMessage(localFeedbackSlot) !== null

  return (
    <div className={shared.boardCol}>
      {/* The info column's StateLine, for a phone, where that column is
          off-canvas (see `MobileStatusBar`). */}
      <MobileStatusBar>
        <StateLine readout={gd.readout} />
      </MobileStatusBar>

      <Board
        tiles={{
          words: gd.board.words,
          results: tileResults,
          decidedBy: gd.board.decidedBy,
          moveCount: gd.board.guessCount,
        }}
        marks={{
          pickedTile: shownPickedTile,
          inFlightGuess,
          endingOutcome,
          isWaitingForTurn: gd.standing.isWaitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        isInteractive={gd.standing.isBoardInteractive}
        isSharedBoard={gd.isSharedBoard}
        onPick={choosePickedTile}
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
