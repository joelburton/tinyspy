// cs-unmet

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useShowOppsSolvedMessages } from '../hooks/useShowOppsSolvedMessages'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'
import type { GGameData } from '../types'

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
 * wordleone's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board and the keyboard, `<InfoCol>` the readouts and
 * the action row, and this component decides what each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop
 * shows the SHARED guess list and the team's misses, compete only my own
 * guesses (a rival's are withheld until the end) plus an opponent strip of
 * their misses.
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

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board and keyboard fill the screen and the info column moves
  // into an off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it. It is shown
  // only when it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The board frame flashes and the bell rings the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

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
  // Each mode reaches exactly one of these (docs/ui.md → Where a message goes).

  // A teammate's miss or solve (coop), in the row's own outcome. My own speak
  // in the local slot instead; in compete the log holds only my own rows until
  // the end, so there is nothing to narrate.
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (guess) => String(guess.id),
    messageFor: (guess) => {
      if (guess.by === gd.me) return null
      const { outcome, text } = peerAnswerMessage(guess)
      return FeedbackMessage.peer(guess.by, outcome, text)
    },
    globalFeedbackSlot,
  })

  // An opponent solved it (compete).
  useShowOppsSolvedMessages(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and that turn replayed.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the answer line.
  const { actions, answerShown } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        myTurnJustStarted={turnFlash}
        // The answer while I have it revealed; null while it stays hidden.
        solution={answerShown ? gd.puzzle.target : null}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
          // The answer while I have it revealed; null while it stays hidden.
          solution={answerShown ? gd.puzzle.target : null}
        />
      </InfoSheet>

      {/* My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Solved! 🎉"
          body={gd.compete ? 'You solved it with the fewest misses.' : 'The team found the word.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
