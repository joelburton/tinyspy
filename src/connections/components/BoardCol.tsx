// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { useWatchAndGetTopFeedbackMsg } from '@/common/feedback/useFeedbackSlot'
import { ActionButton } from '@/common/actions/ActionButton'
import { useIsPhone } from '@/common/mobile/useIsPhone'
import { colorByUserIdMap } from '@/common/members/memberColor'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import { useVerdictMark } from '../hooks/useVerdictMark'
import { useMarkForeignGuesses } from '../hooks/useMarkForeignGuesses'
import { useSubmitGuess } from '../hooks/useSubmitGuess'
import { useBoardColActions } from '../hooks/useBoardColActions'
import { getUnmatchedCats } from '../lib/getUnmatchedCats'
import { Board } from './Board'
import { StrikeMarks } from './StrikeMarks'
import shared from '@/common/game-page/playArea.module.css'
import historyStyles from '@/common/event-log/historyViewer.module.css'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GPicks } from '../types'

/** Empty owner map — the board draws no picks while viewing a past turn or
 *  once my play is over. */
const NO_OWNERS: ReadonlyMap<string, string> = new Map()

/**
 * connections' board column: the `Board`, and under it Clear and Submit with
 * the mistakes beside them, or the local slot's message in their place. It
 * sends the guess (`useSubmitGuess`) and owns the verdict mark on the tiles
 * it was about (`useVerdictMark`, fed by my answers and, through
 * `useMarkForeignGuesses`, by a teammate's rows); the board itself — its order, its cursor,
 * its Shuffle — is `Board`'s. The picks are `useGame`'s, shared over
 * Broadcast in coop, so this column renders and commits them. See
 * docs/playarea.md.
 */
export function BoardCol({
  gd,
  picks,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
  solutionShown,
}: {
  gd: GGameData
  picks: GPicks
  historyView: GHistoryView
  // PlayArea's below-board slot: a guess's answer shows into it, and while it
  // holds anything the pill takes the commit row's place.
  localFeedbackSlot: FeedbackSlot
  myTurnJustStarted: boolean
  // Is the ANSWER on the board right now (the reveal)?
  solutionShown: boolean
}) {
  // A past turn on screen blocks every write to the board.
  const canPick = gd.me.onTurn && !historyView.isViewing
  const canSubmit = canPick

  // The rows on the board I play: every guess on coop's shared board, only my
  // own in compete (doesn't change at end of game; still just "my board" events)
  const boardEvents = gd.events.filter((e) => gd.oneBoard || e.by === gd.me)

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
    canPick,
    canSubmit,
    unionTiles: picks.union,
    submitGuess: submission.send,
    sendClear: picks.sendClear,
  })

  // A pick is the player's next move: it dismisses the last answer, pill and
  // fill together, then toggles the tile.
  function pickTile(tile: string) {
    if (!canPick) return
    localFeedbackSlot.dismiss()
    verdict.clear()
    picks.toggleTile(tile)
  }

  // ─── Render ────────────────────────────────────────────

  // The categories nobody got — only while this viewer is asking for them.
  const unmatchedCats = solutionShown ? getUnmatchedCats(gd.puzzle.cats, gd.me.board.matchedCats) : []

  // No picks are drawn on a board that can't take a move — a past turn, or a
  // player who is finished — though the broadcast state itself outlives both.
  const shownOwnerByTile =
    historyView.isViewing || !gd.me.stillPlaying ? NO_OWNERS : picks.ownerByTile

  // The players are working one board together: coop with more than one of
  // them. Solo, and in compete, each board is one player's own.
  const isSharedBoard = gd.oneBoard && gd.players.length > 1

  const isPhone = useIsPhone()
  const buttonShow = isPhone ? 'icon' : 'both'
  const isLocalFeedbackShown = useWatchAndGetTopFeedbackMsg(localFeedbackSlot) !== null

  return (
    <div className={shared.boardCol}>
      <Board
        matchedCats={gd.me.board.matchedCats}
        unmatchedCats={unmatchedCats}
        tilesLeft={gd.me.board.tilesLeft}
        solutionShown={solutionShown}
        historyView={historyView}
        isBoardInteractive={gd.me.onTurn}
        isStillPlaying={gd.me.stillPlaying}
        ownerByTile={shownOwnerByTile}
        onPick={pickTile}
        inFlightGuess={submission.inFlight}
        verdict={verdict.mark}
        colorByUserId={colorByUserIdMap(gd.players)}
        isSharedBoard={isSharedBoard}
        isWaitingForTurn={gd.me.waitingForTurn}
        myTurnJustStarted={myTurnJustStarted}
        // Bands the board once I have ended: the game's ending, or mine while
        // the others play on.
        endingOutcome={gd.me.outcome}
        moveCount={boardEvents.length}
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
