// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type {
  PlayAreaLoaderProps,
} from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import {
  CelebrationBlockingModal,
} from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
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
 * letterboxed's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the square, the entry and the move, `<InfoCol>` the
 * readouts and the action row, and this component decides what each of them
 * is handed — the chain to show above all: a past move's, or the live one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * ONE shared chain, compete my own chain plus an opponent strip of the two
 * numbers a race may publish — letters covered and words used (a rival's words
 * are withheld until the end).
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

  // The entry is typed at the window rather than into an input, so nothing
  // here takes focus and Tab has nowhere to go; an empty ring keeps it from
  // walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it — every
  // teammate's on a coop solve, the solver's in a race, each tied racer's on a
  // timeout. It is shown only when it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // The board frame flashes and the bell rings the moment the move becomes
  // mine (turn-order coop; never in a free-for-all, where it always is).
  const turnFlash = useTurnStartFlash(gd.me.onTurn)

  // The below-board slot: word results, the hint ladder, the standing
  // conditions, the ending.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have conceded and the others race on.
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

  // A teammate's move, in the header slot (coop).
  useShowTeammateMoves(gd, globalFeedbackSlot, localFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past move, if any, is open on the board, and its chain replayed.
  const historyView = useHistoryView(gd)

  // ─── The commands, and the menu that lists them ────────
  // Every command this game offers: the info column's action row places them,
  // the menu lists them, and the reveal's state comes back for the info column.
  const { actions, solutionShown } = useActionsAndMenu({
    gd,
    localFeedbackSlot,
    goToFollowUpGame,
    menu,
  })

  // ─── Render ────────────────────────────────────────────

  // The chain to show: a past move's while one is open, else the live one.
  const shownWords = historyView.words ?? gd.me.board.words

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownWords={shownWords}
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
          solution={solutionShown ? gd.puzzle.solution : null}
        />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it is
          carried in-page, by the below-board pill and the action row's line.
          My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal title="All twelve! 🐍" onClose={celebration.close} />
      )}
    </div>
  )
}
