// cs-fixed-outcome-fix

import { useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { CelebrationBlockingModal } from '@/common/ending/CelebrationBlockingModal'
import { useCelebration } from '@/common/ending/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { offBoardIds } from '../lib/board'
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
 * stackdown's play surface, shared by the coop and compete manifests — the
 * coordinator. It holds no board and draws no control of its own:
 * `<BoardCol>` takes the stack, the entry and the move, `<InfoCol>` the
 * readouts and the action row, and this component decides what each of them
 * is handed — the stack to show above all: a past turn's, or the live one.
 *
 * Both manifests mount it, and the mode (`gd.mode`) is what differs: coop is
 * ONE shared stack, compete my own copy plus an opponent strip of the one
 * number a race publishes — words cleared (a rival's words and stack are
 * withheld until the end).
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

  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // On a phone the board fills the screen and the info column moves into an
  // off-canvas <InfoSheet> (docs/mobile.md → The info-sheet recipe).
  const infoSheet = useInfoSheet()

  // Confetti the moment the win is MINE, as the server ranked it — every
  // teammate's on a coop clear, the clearer's in a race. It is shown only when
  // it happens.
  const celebration = useCelebration(gd.me.outcome === 'won')

  // ─── The local slot ────────────────────────────────────
  // Messages about ME: word results, the hint ladder, the standing
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

  // ─── Narration ─────────────────────────────────────────
  // Messages about somebody ELSE: a teammate's move, in the header slot and on
  // their tiles (coop).
  const peerMark = useShowTeammateMoves(gd, globalFeedbackSlot)

  // ─── The turn-history view ─────────────────────────────
  // Which past turn, if any, is open on the board, and its stack replayed.
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

  // The tiles off the live board, by the rule the printout shares: once the
  // game has ended a cleared stack comes back for review, and an uncleared one
  // stays where it stopped.
  const liveOffTileIds = useMemo(() => {
    const onBoard = new Set(gd.me.board.tiles.map((t) => t.id))
    const cleared = gd.puzzle.tiles.filter((t) => !onBoard.has(t.id)).map((t) => t.id)
    return offBoardIds(gd.puzzle.tiles, cleared, gd.ended)
  }, [gd.me.board.tiles, gd.puzzle.tiles, gd.ended])

  // The stack to show: a past turn's while one is open, else the live one.
  const shownOffTileIds = historyView.offTileIds ?? liveOffTileIds

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        gd={gd}
        shownOffTileIds={shownOffTileIds}
        historyView={historyView}
        localFeedbackSlot={localFeedbackSlot}
        peerMark={peerMark}
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

      {/* No modal for the verdict (docs/ui.md → Endings): it is
          carried in-page, by the below-board pill and the action row's line.
          My win's confetti — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="Stack cleared! 🎉"
          body="All six words found."
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
