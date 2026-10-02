// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { ActionButton } from '@/common/actions/ActionButton'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { colorByUserIdMap } from '@/common/members/memberColor'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import { useVerdictMark } from '../hooks/useVerdictMark'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { unmatchedCategories } from '../lib/unmatchedCategories'
import { Board } from './Board'
import { StrikeMarks } from './StrikeMarks'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** Empty owner map — the board draws no picks while viewing a past turn or
 *  once my play is over. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/**
 * connections' board column: the `Board`, and under it Clear and Submit with
 * the mistakes beside them, or the local slot's message in their place. It
 * sends the guess (`useSubmitGuess`) and owns the verdict fill on the tiles
 * it was about (`useVerdictMark`); the board itself — its order, its cursor,
 * its Shuffle — is `Board`'s. The picks are `useGame`'s, shared over
 * Broadcast in coop, so this column renders and commits `gd.picks`. See
 * docs/playarea.md.
 */
export function BoardCol({
  gd,
  historyView,
  localFeedbackSlot,
  endingOutcome,
  myTurnJustStarted,
  solutionShown,
}: {
  gd: GameData
  historyView: HistoryView
  // PlayArea's below-board slot: a guess's answer shows into it, and while it
  // holds anything the pill takes the commit row's place.
  localFeedbackSlot: FeedbackSlot
  // Passed through to `Board`'s frame. Null while I play.
  endingOutcome: EndOutcome | null
  myTurnJustStarted: boolean
  // Is the ANSWER on the board right now (the reveal)?
  solutionShown: boolean
}) {
  // A past turn on screen blocks every write to the board.
  const canPick = gd.standing.isBoardInteractive && !historyView.isViewing
  const canSubmit = gd.standing.isMyTurn && !historyView.isViewing

  const verdict = useVerdictMark({
    guesses: gd.boardEvents,
    myId: gd.me?.id ?? null,
    localFeedbackSlot,
    isViewingHistory: historyView.isViewing,
  })
  const submission = useSubmitGuess({
    gd,
    localFeedbackSlot,
    showVerdictFor: verdict.showFor,
  })
  const actions = useBoardColActions({
    canPick,
    canSubmit,
    unionTiles: gd.picks.union,
    submitGuess: submission.send,
    sendClear: gd.picks.sendClear,
  })

  // A pick is the player's next move: it dismisses the last answer, pill and
  // fill together, then toggles the tile.
  function pickTile(tile: string) {
    if (!canPick) return
    localFeedbackSlot.dismiss()
    verdict.clear()
    gd.picks.toggleTile(tile)
  }

  // ─── Render ────────────────────────────────────────────

  // The categories nobody got — only while this viewer is asking for them.
  const unmatched = solutionShown ? unmatchedCategories(gd.puzzle.board, gd.matchedCategories) : []

  // No picks are drawn on a board that can't take a move — a past turn, or a
  // player who is finished — though the broadcast state itself outlives both.
  const shownOwnerByTile =
    historyView.isViewing || !gd.standing.isStillPlaying ? NO_OWNERS : gd.picks.ownerByTile

  const isPhone = useIsPhone()
  const buttonShow = isPhone ? 'icon' : 'both'
  const isLocalFeedbackShown = useTopFeedbackMessage(localFeedbackSlot) !== null

  return (
    <div className={shared.boardCol}>
      <Board
        matched={gd.matchedCategories}
        unmatched={unmatched}
        remainingTiles={gd.puzzle.remainingTiles}
        solutionShown={solutionShown}
        historyView={historyView}
        isBoardInteractive={gd.standing.isBoardInteractive}
        isStillPlaying={gd.standing.isStillPlaying}
        ownerByTile={shownOwnerByTile}
        onPick={pickTile}
        inFlightGuess={submission.inFlight}
        verdict={verdict.mark}
        colorByUserId={colorByUserIdMap(gd.players)}
        isSharedBoard={gd.isSharedBoard}
        isWaitingForTurn={gd.standing.isWaitingForTurn}
        myTurnJustStarted={myTurnJustStarted}
        endingOutcome={endingOutcome}
        moveCount={gd.boardEvents.length}
      />

      {/* The slot under the board: the commit row with the inline mistakes, or
          the local slot's message in its place, in one reserved height so the
          board never shifts; the history banner overlays both while a past
          turn is open. */}
      <div className={styles.belowBoard}>
        <div
          className={cls(
            shared.moveAreaOrLocalFeedback,
            historyView.isViewing && history.historyBannerHost,
          )}
        >
          {historyView.label !== null && (
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
                <StrikeMarks used={gd.readout.mistakeCount} total={gd.readout.maxMistakes} />
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
