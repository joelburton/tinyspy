// cs-blessed-psychicnum

import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { peerAnswerMessage } from '../lib/answer'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { addRevealedSecrets } from '../lib/tileResults'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { useShowOppsFoundMessages } from '../hooks/useShowOppsFoundMessages'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // psychicnum-specific tokens (empty today, see file)
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
      auth={ctx.auth}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  'auth' | 'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'
> & {
  gd: GGameData
}

/**
 * psychicnum's play surface — the coordinator. It holds no board and draws no
 * control of its own: `<BoardCol>` takes the board and Clear/Submit,
 * `<InfoCol>` the readouts and the action row, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`, fixed at create-game time)
 * is what differs — who a narration names, whose progress a readout counts,
 * and which verdict `lib/gameEndingMessage.ts` builds. The rule it keeps across that
 * split: green means "a secret was found" in both modes, so nothing here
 * teaches a compete-only color.
 *
 * Above it, `<GamePage>` owns members, the timer, pause and chat, and unmounts
 * this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  gd,
  auth,
  globalFeedbackSlot,
  goToFollowUpGame,
  menu,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, and the two things that fire at a
  // moment rather than describing a state — the win's confetti and the frame's
  // flash (and the bell) when the turn becomes mine.

  // Tab isn't used; an empty ring keeps it from reaching browser chrome.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it. It is shown
  // only when it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The board frame flashes and the bell rings the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

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
    isWaiting: gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // ─── What a PEER did, in the header slot ───────────────
  // Each mode reaches exactly one of these (docs/ui.md → Where a message goes).

  // A teammate's guess, hint or spoiler (coop). My own events are the local
  // slot's and the log's, so they're skipped; in compete the log holds only my
  // own rows until the end, so there is nothing to narrate.
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (event) => String(event.id),
    messageFor: (event) => {
      if (event.by === gd.me) return null
      const { outcome, text } = peerAnswerMessage(event)
      return FeedbackMessage.peer(event.by, outcome, text)
    },
    globalFeedbackSlot,
  })

  // An opponent found a secret (compete): say so, never which.
  useShowOppsFoundMessages(gd, auth.user.id, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and that turn replayed.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the board.
  const { actions, secretsShown } = useActionsAndMenu({
    gd,
    myId: auth.user.id,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The live board, with the secrets added while I have them revealed.
  const liveTileResults = secretsShown
    ? addRevealedSecrets(gd.me.board.tileResults, gd.puzzle.secrets ?? [])
    : gd.me.board.tileResults

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>

      <BoardCol
        gd={gd}
        // A past turn's board while one is open, else the live one.
        tileResults={historyView.tileResults ?? liveTileResults}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        myTurnJustStarted={turnFlash}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          myId={auth.user.id}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
        />
      </InfoSheet>

      {/* My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={gd.compete
            ? 'You found all three first.'
            : 'All three secret words found.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
