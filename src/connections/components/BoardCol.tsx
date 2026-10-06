// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { ActionButton } from '@/common/actions/ActionButton'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { colorByUserIdMap } from '@/common/members/memberColor'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { usePicks } from '../hooks/usePicks'
import { useVerdictMark } from '../hooks/useVerdictMark'
import { useMarkForeignGuesses } from '../hooks/useMarkForeignGuesses'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { Board } from './Board'
import { StrikeMarks } from './StrikeMarks'
import shared from '@/common/game-page/playArea.module.css'
import historyStyles from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import type { GBoard, GCategory, GGameData, GHistoryView, GTile } from '../types'

/**
 * connections' board column: the `Board`, and under it Clear and Submit with
 * the mistakes beside them, or the local slot's message in their place. It
 * sends the guess (`useSubmitGuess`) and owns the verdict mark on the tiles
 * it was about (`useVerdictMark`, fed by my answers and, through
 * `useMarkForeignGuesses`, by a teammate's rows) and the picks the guess is
 * built from (`usePicks`, shared over Broadcast in coop); the board itself —
 * its order, its cursor, its Shuffle — is `Board`'s. See docs/playarea.md.
 */
export function BoardCol({
  gd,
  board,
  revealedCats,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
}: {
  gd: GGameData
  // The board on screen: the live one, the reveal's, or a past turn's
  // (PlayArea picks).
  board: GBoard
  // The categories the reveal shows in place of the loose tiles; `[]` otherwise.
  revealedCats: GCategory[]
  historyView: GHistoryView
  // PlayArea's below-board slot: a guess's answer shows into it, and while it
  // holds anything the pill takes the commit row's place.
  localFeedbackSlot: FeedbackSlot
  myTurnJustStarted: boolean
}) {
  // The board is mine to touch: my move, and the live board on screen — a
  // click or key on a past turn is the viewer's exit, and must not also act.
  // The board takes picks under this gate, and Clear and Submit show under it.
  const isInteractive = gd.me.onTurn && !historyView.isViewing

  const picks = usePicks({ gameId: gd.id, isCompete: gd.compete, myId: gd.me.id })

  // The rows on the board I play: every guess on coop's shared board, only my
  // own in compete.
  const boardEvents = gd.events.filter((e) => gd.coop || e.by === gd.me)

  const verdict = useVerdictMark({ localFeedbackSlot })
  useMarkForeignGuesses({
    guesses: boardEvents,
    me: gd.me,
    isViewingHistory: historyView.isViewing,
    verdict,
  })

  const submission = useSubmitGuess({
    gd,
    picks,
    localFeedbackSlot,
    markTiles: verdict.markTiles,
  })

  const actions = useBoardColActions({
    isInteractive,
    picks,
    submitGuess: submission.send,
  })

  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // A pick is the player's next move: it dismisses the last answer, pill and
  // fill together, then toggles the tile.
  function pickTile(tile: GTile) {
    localFeedbackSlot.dismiss()
    verdict.clear()
    picks.toggleTile(tile.id)
  }

  // ─── Render ────────────────────────────────────────────

  // The players are working one board together: coop with more than one of
  // them. Solo, and in compete, each board is one player's own.
  const isSharedBoard = gd.coop && gd.players.length > 1

  // Each picked tile, with its picker's color where WHOSE pick is worth
  // saying — on a shared board — and null where it is not. No picks are drawn
  // on a board that can't take a move — a past turn, or a player who is
  // finished — though the broadcast state itself outlives both.
  const arePicksShown = !historyView.isViewing && gd.me.stillPlaying
  const colorByUserId = colorByUserIdMap(gd.players)
  const tileToPickerColor = new Map<string, string | null>()
  if (arePicksShown) {
    for (const [tile, pickerId] of picks.tileToPickerId) {
      // A pick is a seated player's, and every seated player is in `gd.players`.
      tileToPickerColor.set(tile, isSharedBoard ? colorByUserId.get(pickerId)! : null)
    }
  }

  const isPhone = useIsPhone()
  const buttonShow = isPhone ? 'icon' : 'both'
  const isLocalFeedbackShown = useWatchAndGetTopFeedbackMsg(localFeedbackSlot) !== null

  return (
    <div className={shared.boardCol}>
      <Board
        board={board}
        revealedCats={revealedCats}
        marks={{
          tileToPickerColor,
          inFlightTileIds: submission.inFlightTileIds,
          verdict: verdict.mark,
          // Bands the board once I have ended: the game's ending, or mine
          // while the others play on.
          endingOutcome: gd.me.outcome,
          isWaitingForTurn: gd.me.waitingForTurn,
          myTurnJustStarted,
        }}
        historyView={historyView}
        isInteractive={isInteractive}
        isStillPlaying={gd.me.stillPlaying}
        // The guesses on my board: the team's in coop, my own in compete.
        moveCount={boardEvents.length}
        onPick={pickTile}
      />

      {/* The slot under the board: the commit row with the inline mistakes, or
          the local slot's message in its place, in one reserved height so the
          board never shifts; the history banner overlays both while a past
          turn is open. */}
      <div className={styles.belowBoard}>
        <div
          className={cls(
            shared.moveAreaOrLocalFeedback,
            historyView.isViewing && historyStyles.historyBannerHost,
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
              {/* A phone drops "(lose at 4)": the strike marks already show
                  the budget. */}
              <div className={styles.mistakesInline}>
                {isPhone ? 'Mistakes' : 'Mistakes (lose at 4)'}{' '}
                <StrikeMarks
                  used={gd.stateLineData.nMistakes}
                  total={gd.stateLineData.maxMistakes}
                />
              </div>
              <ActionButton
                action={actions.actClearPicks}
                show={buttonShow}
                className={styles.inputButton}
              />
              <ActionButton
                action={actions.actSubmit}
                show={buttonShow}
                weight="primary"
                className={styles.inputButton}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
