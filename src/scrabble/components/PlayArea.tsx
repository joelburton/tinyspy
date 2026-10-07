// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useDriveAiTurns } from '../hooks/useDriveAiTurns'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useMovePreview } from '../hooks/useMovePreview'
import { useShowOpponentMoves } from '../hooks/useShowOpponentMoves'
import { useSuggestMove } from '../hooks/useSuggestMove'
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
  return (
    <PlayArea
      gd={gd}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
    />
  )
}

type PlayAreaProps =
  Pick<PlayAreaLoaderProps, 'goToFollowUpGame' | 'menu' | 'globalFeedbackSlot'>
  & {
  gd: GGameData
}

/**
 * scrabble's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the board, the rack and the move, `<InfoCol>` the
 * readouts and the action row, and this component decides what each of them
 * is handed — the board to show above all: a past turn's, or the live one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * one board and one rack for the team, with the suggester and a teammate's
 * preview; compete is the same board played in turns, each player with a
 * rack of their own, and bots among them.
 *
 * The client scores every play itself (`lib/play.ts`) and the server trusts
 * the score, checking the words against the dictionary alone.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it.
 */
function PlayArea({
  gd,
  goToFollowUpGame,
  menu,
  globalFeedbackSlot,
}: PlayAreaProps) {
  // ─── Page hooks ────────────────────────────────────────

  // The board is worked by drags, clicks and typing, so Tab has nowhere to go
  // here — and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it: the team's
  // in coop (every tile played), mine in a race, a tie included.
  const celebration = useCelebration(gd.ended && gd.me.outcome === 'won')

  // A bot holding the turn plays it.
  useDriveAiTurns(gd)

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a move's answer, the ending, whose turn it is.
  const localFeedbackSlot = useFeedbackSlot('local')

  // My ending's message, for the pill and the info column: the game's once it
  // has ended, mine while I have conceded and the others play on.
  const { endingMessage, endedBy } = useGetEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage: endedBy === 'game' ? endingMessage : null,
    playerEndingMessage: endedBy === 'player' ? endingMessage : null,
  })

  // Whose turn it is, under coop's turn order. Compete's state line already
  // names the player on turn.
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.coop && gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // The board frame flashes and the bell rings the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

  // ─── Narration ─────────────────────────────────────────
  // An opponent's turn, in the header slot.
  useShowOpponentMoves(gd, globalFeedbackSlot)

  // ─── The board viewer ──────────────────────────────────
  // A past turn, or a teammate's preview, open on the board.
  const historyView = useHistoryView(gd)

  // A teammate's preview arrives over Broadcast and opens on the viewer.
  const { sendPreview } = useMovePreview({
    gameId: gd.id,
    mode: gd.mode,
    onReceive: historyView.openPreview,
  })

  // ─── The commands, and the menu that lists them ────────
  // Coop's suggester: its panel, its action, and the applier the board
  // column registers.
  const suggestion = useSuggestMove(gd)

  const { actions } = useActionsAndMenu({
    gd,
    actSuggestMove: suggestion.actSuggestMove,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The board to show: a past turn's while one is open, else the live one — a
  // teammate's preview is drawn over the live board.
  const shownCells = historyView.cells ?? gd.me.board.cells

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownCells={shownCells}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        sendPreview={sendPreview}
        registerSuggestionApplier={suggestion.registerApplier}
        myTurnJustStarted={turnFlash}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
          gd={gd}
          endingMessage={endingMessage}
          actions={actions}
          historyView={historyView}
          suggestion={suggestion}
        />
      </InfoSheet>

      {celebration.isOpen && (
        <CelebrationBlockingModal
          title={gd.coop ? 'Every tile played! 🎉' : 'You win! 🎉'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
