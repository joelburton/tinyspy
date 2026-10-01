// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame, type GameData } from '../hooks/useGame'
import { useBindActionsAndPublishMenu } from '../hooks/useBindActionsAndPublishMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { useShowOppsSolvedMessages } from '../hooks/useShowOppsSolvedMessages'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * The three gates in front of wordle's play surface: the read is out, the read
 * failed, or there is no such game. Everything below starts with the game data
 * in hand, which is why the surface never writes `gd?.`.
 *
 * The game's menu rows and its `+` arrive WITH the game, because the surface
 * that binds them mounts with it — a row for a game not yet read could only
 * gray itself or lie.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd, loading, failure } = useGame(ctx)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `gd` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and wordle's does not: a torn write, or a
  // game deleted while somebody had the board open. `detail` goes to the
  // console, never to the page.
  if (!gd) return <NoSuchGamePage detail={`rows=0 view=wordle.games_state game=${ctx.gameId}`} />

  return (
    <PlayArea
      gd={gd}
      authSession={ctx.authSession}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      clubHandle={ctx.clubHandle}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      brand={ctx.brand}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  | 'authSession'
  | 'globalFeedbackSlot'
  | 'clubHandle'
  | 'goToFollowUpGame'
  | 'menu'
  | 'brand'
> & {
  // The game data. Non-null by construction — the loader holds the gates.
  gd: GameData
}

/**
 * wordle's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board and the keyboard, `<InfoCol>` the readouts and
 * the action row, and this component decides what each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop
 * shows the SHARED guess list and team budget, compete only my own guesses
 * (RLS hides the rest until the end) plus an opponent strip of their counts.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  gd,
  authSession,
  globalFeedbackSlot,
  clubHandle,
  goToFollowUpGame,
  menu,
  brand,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board and keyboard fill the screen and the info column moves
  // into an off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE. It is shown only when it happens.
  // SPECTATING: a club member watching has no outcome of their own, so gets
  // none.
  const celebration = useCelebration(gd.me?.outcome === 'won')

  // The board frame flashes the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.standing.isMyTurn)

  // ─── The local slot, and what stands in it ─────────────

  // The slot under the board is for messages about ME.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have ended and the others play on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // A teammate holds the move (turn-order coop; never in a free-for-all).
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.standing.isWaitingForTurn,
    holder: gd.turnHolder,
  })

  // ─── What a PEER did, in the header slot ───────────────
  // Each mode reaches exactly one of these (docs/ui.md → Where a message goes).

  // A teammate's accepted guess (coop), in the row's own outcome. My own land
  // on the shared board instead; in compete the log holds only my own rows
  // until the end, so there is nothing to narrate.
  useShowPeerFeedback({
    enabled: !gd.isCompete,
    items: gd.events,
    keyOf: (guess) => String(guess.id),
    messageFor: (guess) => {
      if (guess.user_id === authSession.user.id) return null
      const { outcome, text } = peerAnswerMessage(guess)
      return FeedbackMessage.peer(gd.playersById[guess.user_id], outcome, text)
    },
    globalFeedbackSlot,
  })

  // An opponent solved it (compete).
  useShowOppsSolvedMessages(gd, authSession.user.id, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and that turn replayed.
  const historyView = useHistoryView(gd, authSession.user.id)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the answer line.
  const { actions, answerShown } = useBindActionsAndPublishMenu({
    gd,
    selfId: authSession.user.id,
    localFeedbackSlot,
    clubHandle,
    goToFollowUpGame,
    menu,
    brand,
  })

  // ─── Render ────────────────────────────────────────────

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        historyView={historyView}
        brand={brand}
        localFeedbackSlot={localFeedbackSlot}
        endingOutcome={endingMessage?.outcome ?? null}
        myTurnJustStarted={turnFlash}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          selfId={authSession.user.id}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
          // The answer while I have it revealed; null while it stays hidden.
          solution={answerShown ? gd.target : null}
        />
      </InfoSheet>

      {/* My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Solved! 🎉"
          body={gd.isCompete ? 'You solved it in the fewest guesses.' : 'The team found the word.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
