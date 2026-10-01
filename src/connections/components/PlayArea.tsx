// cs-blessed-connections

import { cls } from '@/common/utils/cls'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { useGame, type GameData } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * The three gates in front of connections' play surface: the read is out, the
 * read failed, or there is no such game. Everything below starts with the game
 * data in hand, which is why the surface never writes `gd?.`.
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
  // `GamePageLoader` each checked — and the connections one does not: a torn
  // write, or a game deleted while somebody had the board open. `detail` goes
  // to the console, never to the page.
  if (!gd) return <NoSuchGamePage detail={`rows=0 table=connections.games game=${ctx.cg.id}`} />

  return (
    <PlayArea
      gd={gd}
      authSession={ctx.authSession}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      clubHandle={ctx.cg.club_handle}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      brand={ctx.manifest.name}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  'authSession' | 'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'
> & {
  // The game data. Non-null by construction — the loader holds the gates.
  gd: GameData
  clubHandle: string
  brand: string
}

/**
 * connections' play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own: `<BoardCol>`
 * takes the grid and the commit row, `<InfoCol>` the readouts and the action
 * row, and this component decides what each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: whose
 * picks the board shows (coop shares them, compete keeps them local), whose
 * progress a readout counts, and the ending's words.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it,
 * the shared picks included.
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
  const myId = authSession.user.id

  // ─── Page hooks ────────────────────────────────────────

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it. It is shown
  // only when it happens.
  // SPECTATING: a club member watching has no outcome of their own, so gets
  // none.
  const celebration = useCelebration(gd.me?.outcome === 'won')

  // The board frame flashes the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.standing.isMyTurn)

  // ─── The local slot, and what stands in it ─────────────

  // The slot under the board is for messages about ME. Any key dismisses one.
  const localFeedbackSlot = useFeedbackSlot('local')
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I am out of the race and the others play on.
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
    holder: gd.turns.turnHolder,
  })

  // ─── What a PEER did, in the header slot ───────────────

  // A teammate's guess (coop). My own are the local slot's, so they're
  // skipped; in compete the log holds only my own rows until the end, so there
  // is nothing to narrate.
  useShowPeerFeedback({
    enabled: !gd.isCompete,
    items: gd.events,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === myId) return null
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(gd.playersById[g.user_id], outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and that turn's board.
  const historyView = useHistoryView(gd, myId)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's and the hint list's states come back.
  const { actions, solutionShown, hintsOpen, acknowledgeModal } = useActionsAndMenu({
    gd,
    selfId: myId,
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
        localFeedbackSlot={localFeedbackSlot}
        endingOutcome={endingMessage?.outcome ?? null}
        myTurnJustStarted={turnFlash}
        solutionShown={solutionShown}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          selfId={myId}
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
          body={gd.isCompete ? 'You found all four first.' : 'All four categories found.'}
          onClose={celebration.close}
        />
      )}
      {acknowledgeModal}
    </div>
  )
}
