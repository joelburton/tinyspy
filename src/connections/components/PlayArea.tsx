// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { getUnmatchedCats } from '../lib/getUnmatchedCats'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'
import type { GGameData } from '../types'

/**
 * The manifest's component: builds `gd` from the blob the page was handed
 * and draws the surface.
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
 * connections' play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own: `<BoardCol>`
 * takes the grid and the commit row, `<InfoCol>` the readouts and the action
 * row, and this component decides what each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: whose
 * picks the board shows (coop shares them, compete keeps them local), whose
 * progress the state line counts, and the ending's words.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it,
 * the shared picks included.
 */
function PlayArea({
  gd,
  globalFeedbackSlot,
  goToFollowUpGame,
  menu,
}: PlayAreaProps) {

  // ─── Page hooks ────────────────────────────────────────

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it. It is shown
  // only when it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The board frame flashes the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

  // ─── The local slot, and what stands in it ─────────────

  // The slot under the board is for messages about ME.
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

  // ─── What a PEER did, in the header slot ───────────────

  // A teammate's guess (coop). My own are the local slot's, so they're
  // skipped; in compete the log holds only my own rows until the end, so there
  // is nothing to narrate.
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.by === gd.me) return null
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(g.by, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and that turn's board.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's and the hint list's states come back.
  const { actions, solutionShown, hintsOpen, acknowledgeModal } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The board to show: a past turn's while one is open; else mine, with the
  // reveal's categories in place of the loose tiles once it is asked for.
  const isRevealShown = solutionShown && !historyView.isViewing
  const shownBoard =
    historyView.board ?? (isRevealShown ? { ...gd.me.board, tilesLeft: [] } : gd.me.board)
  const revealedCats =
    isRevealShown ? getUnmatchedCats(gd.puzzle.cats, gd.me.board.matchedCats) : []

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        board={shownBoard}
        revealedCats={revealedCats}
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
          hintsOpen={hintsOpen}
        />
      </InfoSheet>

      {/* My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={gd.compete ? 'You found all four first.' : 'All four categories found.'}
          onClose={celebration.close}
        />
      )}
      {acknowledgeModal}
    </div>
  )
}
