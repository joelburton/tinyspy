// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import {
  CelebrationBlockingModal,
} from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useShowOppsEndedMessages } from '../hooks/useShowOppsEndedMessages'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import type { GGameData, GTile } from '../types'

/**
 * The manifest's component: builds `gd` from the blob the page was handed and
 * draws the surface.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd } = useGame(ctx)
  return (
    <PlayArea
      gd={gd}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'
> & {
  gd: GGameData
}

/**
 * waffle's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board and the swap, `<InfoCol>` the readouts and the
 * action row, and this component decides what each of them is handed — the
 * board to show above all: a past swap's, the revealed solution, or the live
 * one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * ONE shared board and the team's budget, compete my own board and count plus
 * an opponent strip of the rivals' counts (their boards are withheld until the
 * end).
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  gd,
  globalFeedbackSlot,
  goToFollowUpGame,
  menu,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // The board is worked by taps, drags and its own keys, so Tab has nowhere to
  // go; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it — every
  // teammate's on a coop solve, the winner's in a race. It is shown only when
  // it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The board frame flashes the moment the move becomes mine (turn-order coop;
  // never in a free-for-all, where the move is always mine).
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a refused swap, the standing conditions, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // My ending's message, for the pill and the info column: the game's once it
  // has ended, mine while I am out of play and the others play on.
  const { endingMessage, endedBy } = useGetEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage: endedBy === 'game' ? endingMessage : null,
    playerEndingMessage: endedBy === 'player' ? endingMessage : null,
  })

  // A teammate holds the move (turn-order coop; never in a free-for-all).
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // ─── Narration ─────────────────────────────────────────
  // Messages about somebody ELSE: a rival solved or ran out of swaps
  // (compete), in the header slot.
  useShowOppsEndedMessages(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past swap, if any, is open on the board, and that swap replayed.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the board.
  const { actions, answerShown } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The solution, while I have it revealed; it reaches the page only once the
  // game has ended. Drawn all green: it is the solution.
  const revealedSolution = answerShown ? gd.puzzle.solution : null
  const revealedTiles: GTile[] | null =
    revealedSolution?.map((t) => ({ ...t, color: 'g' })) ?? null
  // The board to show: a past swap's while one is open, else the revealed
  // solution, else the live one.
  const shownTiles = historyView.tiles ?? revealedTiles ?? gd.me.board.tiles

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownTiles={shownTiles}
        isLiveBoard={shownTiles === gd.me.board.tiles}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        myTurnJustStarted={turnFlash}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
          solution={revealedSolution}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Endings): it is
          carried in-page, by the below-board pill and the action row's line.
          My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Solved it! 🧇"
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
