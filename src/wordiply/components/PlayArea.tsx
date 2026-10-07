// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
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
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
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
 * wordiply's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board, the keyboard and the move, `<InfoCol>` the
 * readouts and the action row, and this component decides what each of them
 * is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop
 * fills one shared five-line board, compete gives each racer their own (a
 * rival's words are withheld until the end) plus an opponent strip of their
 * counts. The only live readout is each word's length; the scores and the
 * best possible word wait for the end.
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

  // The entry is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser.
  useTabRing([])

  // On a phone the board and keyboard fill the screen and the info column moves
  // into an off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment a race is MINE, as the server ranked it. A coop table's
  // five words spent is a win too, but not one to throw confetti at: the team
  // did as well as it did, and the score says how well.
  const celebration = useCelebration(gd.compete && gd.me.outcome === 'won')

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a refused word, the standing conditions, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have ended and the others race on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // A teammate holds the move (turn-order coop; never in a free-for-all).
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // ─── Narration ─────────────────────────────────────────
  // Messages about somebody ELSE, in the header slot.

  // A teammate's accepted word (coop), with its length — the one live readout.
  // My own land on the board instead, and the board marks a teammate's too
  // (`useMarkForeignGuesses`, in `BoardCol`).
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (guess) => String(guess.id),
    messageFor: (guess) => {
      if (!guess.valid || guess.by === gd.me) return null
      const { outcome, text } = peerAnswerMessage(guess)
      return FeedbackMessage.peer(guess.by, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The turn-history view ─────────────────────────────
  // Which past row, if any, is open on the board, and the board as it stood.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the word line.
  const { actions, solutionShown } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
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
          // The best possible word while I have it revealed; null while it
          // stays hidden.
          solution={solutionShown ? (gd.puzzle.longestWords[0] ?? null) : null}
        />
      </InfoSheet>

      {/* My race win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          // My scores are written with the ending that ranked me.
          body={`${gd.me.lengthScore}%, ${gd.me.nLetters} letters.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
