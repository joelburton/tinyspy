// cs-fixed-outcome-fix

import { useEffect } from 'react'
import { cls } from '@/common/utils/cls'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { paletteOf } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { useActionsAndMenu } from '../hooks/useActionsAndMenu'
import { useHistoryView } from '../hooks/useHistoryView'
import { useGetEndingMessage } from '../hooks/useGetEndingMessage'
import { useShowTeammateMoves } from '../hooks/useShowTeammateMoves'
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
 * setgame's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the table and the move, `<InfoCol>` the readouts and the
 * action row, and this component decides what each of them is handed — the
 * table to show above all: a past turn's, or the live one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * one table and one team, compete the same table contended by racers plus an
 * opponent strip of their counts.
 *
 * The game is unusual for this roster in how LITTLE the client has to be told:
 * every tile is face-up, so the frontend holds the whole rule and can judge a
 * pick itself — a wrong claim never reaches the server. The one refusal that
 * does happen is contention: a rival claims a tile out from under a half-made
 * pick, and the server's row lock means exactly one of two overlapping claims
 * wins.
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

  // The board is worked by clicks and letter keys, so Tab has nowhere to go
  // here — and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the team wins a coop game: a perfect clear, every tile
  // in a set. It is shown only when it happens.
  const celebration = useCelebration(gd.coop && gd.me.outcome === 'won')

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: a claim's refusal, the hint's, the standing conditions,
  // the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // My ending's message, for the pill and the info column: the game's once it
  // has ended, mine while I have conceded and the others play on.
  const { endingMessage, endedBy } = useGetEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage: endedBy === 'game' ? endingMessage : null,
    playerEndingMessage: endedBy === 'player' ? endingMessage : null,
  })

  // Whose turn it is, under turn order.
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.me.waitingForTurn,
    holder: gd.turns?.holder ?? null,
  })

  // Under turn order the slot prompts me when the table is waiting on ME — the
  // counterpart to "Waiting for ● Name…". A `prompt`, which everything else
  // outranks: "Not a set" and "Someone got there first" both land while it is
  // my turn, and show over it.
  const isMyMove = gd.turns !== null && gd.me.onTurn
  useEffect(function showYourTurnPrompt() {
    if (!isMyMove) return
    const id = localFeedbackSlot.show(FeedbackMessage.prompt(
      'Waiting for your move'))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isMyMove])

  // The board frame flashes and the bell rings the moment the move becomes mine.
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

  // ─── Narration ─────────────────────────────────────────
  // A teammate's claim, in the header slot.
  useShowTeammateMoves(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and the table it left.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  const { actions } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The table to show: a past turn's while one is open, else the live one.
  const shownTiles = historyView.tiles ?? gd.me.board.tiles

  return (
    <div
      className={cls(
        shared.layout,
        shared.mobileFill,
        styles.layout,
        // The colorblind-safe palette repaints the three color tokens for
        // everything inside — the board AND the info column's small tiles.
        paletteOf(gd.setup) === 'colorblind' && 'setgamePaletteColorblind',
      )}
    >
      <BoardCol
        gd={gd}
        shownTiles={shownTiles}
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
        />
      </InfoSheet>

      {/* The team's win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Perfect clear! 🎉"
          body={`Every tile in a set: ${gd.me.nSetsFound} sets.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
