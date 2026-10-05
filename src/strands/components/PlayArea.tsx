// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import type { GGameData } from '../types'

import '../theme.css'

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd } = useGame(ctx)
  return <PlayArea gd={gd} goToFollowUpGame={ctx.goToFollowUpGame} menu={ctx.menu} />
}

type PlayAreaProps = Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu'> & {
  gd: GGameData
}

/**
 * strands' play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board, the entry, the hint bar and the move,
 * `<InfoCol>` the readouts and the action row, and this component decides what
 * each of them is handed — the board to show above all: a past turn's, or the
 * live one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * ONE shared board, compete my own board over the same letters plus an
 * opponent strip of the one number a race publishes — hints used.
 *
 * **Acceptance is the server's**: a trace round-trips through
 * `strands.submit_path` rather than being scored here, because the frontend
 * has no solution and no dictionary, so it *cannot* classify.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({ gd, goToFollowUpGame, menu }: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // The board is traced with clicks and keys, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it — every
  // teammate's on a coop solve, the winner's in a race. It is shown only when it
  // happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a move's result, the hint bar's answers, the standing
  // conditions, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have solved or conceded and the others race on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // Whose turn it is, under turn order.
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and its board replayed.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command the action row places: the info column places them, the
  // menu lists them, and the reveal's state comes back for the board and the
  // info column.
  const { actions, solutionShown, acknowledgeModal } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The words my board did not find, while I have the solution shown: gray
  // lines on the board, beside the words the info column names. The words
  // arrive once the game has ended, so mid-game this is empty by construction.
  const missedPuzzleWords = useMemo(() => {
    if (!solutionShown || gd.puzzle.puzzleWords === null) return []
    const foundSpellings = new Set(gd.me.board.foundPuzzleWords.map((w) => w.word))
    return gd.puzzle.puzzleWords.filter((w) => !foundSpellings.has(w.word))
  }, [solutionShown, gd.puzzle.puzzleWords, gd.me.board.foundPuzzleWords])

  // The board to show: a past turn's while one is open, else the live one.
  const shownBoard = historyView.board ?? gd.me.board

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownBoard={shownBoard}
        missedPuzzleWords={missedPuzzleWords}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
          puzzleWords={solutionShown ? gd.puzzle.puzzleWords : null}
        />
      </InfoSheet>

      {acknowledgeModal}
      {/* No modal for the verdict (docs/ui.md → Terminal results): it is
          carried in-page, by the below-board pill and the action row's line.
          My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title={gd.compete ? 'You win!' : 'You found them all!'}
          body={
            gd.compete
              ? `Solved on ${gd.me.nHintsUsed} hint${gd.me.nHintsUsed === 1 ? '' : 's'}.`
              : `Every word on the board — ${gd.stateLineData.nFoundPuzzleWords} of them.`
          }
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
