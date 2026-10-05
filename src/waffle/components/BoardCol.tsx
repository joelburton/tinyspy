// cs-fixed-outcome-fix

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import shared from '@/common/game-page/playArea.module.css'
import { useSubmitSwap } from '../hooks/useSubmitSwap'
import { makeBoardString, makeColorString, swapCells, unjudgeCells } from '../lib/waffle'
import { Board } from './Board'
import { StateLine } from './StateLine'
import styles from './BoardCol.module.css'
import type { GGameData, GHistoryView, GTile } from '../types'

/**
 * The tiles as the two 25-char strings `Board` draws — its letters and its
 * colors — with a swap still out applied: its letters traded, its two cells
 * unjudged. Board takes the tiles itself at its own pass, and this goes.
 */
function makeBoardStrings(
  tiles: GTile[],
  pendingSwap: readonly [number, number] | null,
): { board: string; colors: string } {
  const board = makeBoardString(tiles)
  const colors = makeColorString(tiles)
  if (pendingSwap === null) return { board, colors }
  return {
    board: swapCells(board, pendingSwap[0], pendingSwap[1]),
    colors: unjudgeCells(colors, pendingSwap),
  }
}

/**
 * waffle's board column — the square `Board` plus the below-board region (the
 * feedback pill + the turn-viewer banner). The move IS the board (tap two tiles
 * to swap), so there are no below-board input controls; the swap is sent from
 * here (`useSubmitSwap`). PlayArea hands it **the board to show** (the live
 * board, the revealed solution, or a past swap's), which is what makes the
 * turn-history viewer a drop-in. See docs/playarea.md.
 */
export function BoardCol({
  gd,
  shownTiles,
  isLiveBoard,
  historyView,
  localFeedbackSlot,
  myTurnJustStarted,
}: {
  gd: GGameData
  // The board to show — PlayArea picks it.
  shownTiles: GTile[]
  // The board shown is the live one, which a swap in flight is drawn on.
  isLiveBoard: boolean
  historyView: GHistoryView
  // PlayArea's below-board slot — a refused swap, "you're out", whose turn,
  // the verdict. Drawn in the reserved-height slot under the board.
  localFeedbackSlot: FeedbackSlot
  // True for a beat at the moment the turn becomes mine — the board frame
  // flashes yellow. Always false in a free-for-all game.
  myTurnJustStarted: boolean
}) {
  const submission = useSubmitSwap({
    gameId: gd.id,
    newestEventId: gd.events.at(-1)?.id ?? null,
    localFeedbackSlot,
  })
  // The swap still out belongs to the live board only.
  const pendingSwap = isLiveBoard ? submission.pendingSwap : null
  const { board, colors } = makeBoardStrings(shownTiles, pendingSwap)

  return (
    // Exit-on-click is intrinsic to the viewer (useHistoryViewer's document
    // listener + the click-through `.historyFrame`), so the board column needs
    // no click handler — a click anywhere returns to live.
    <div className={shared.boardCol}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the live swaps/par readout, above the board. It's a fixed-height row,
          and waffle's square board sizes off `--avail-h` — so Board.module.css
          subtracts this row's height there too, or the square would overflow
          the viewport (the hard no-scroll invariant). */}
      <MobileStatusBar>
        <StateLine data={gd.stateLineData} />
      </MobileStatusBar>
      <Board
        board={board}
        colors={colors}
        isBoardInteractive={gd.me.onTurn}
        isViewingHistory={historyView.isViewing}
        historyLitTiles={new Set([...historyView.litTileIds].map(Number))}
        onSwap={submission.send}
        pendingSwap={pendingSwap}
        isWaitingForTurn={gd.me.waitingForTurn}
        myTurnJustStarted={myTurnJustStarted}
        // The finished board wears my ending's outcome — the same one the
        // below-board verdict and the info column's line read.
        gameOver={gd.ended ? gd.me.outcome : null}
        // The swaps behind the board on show — the team's in coop, my own in
        // compete. A Restart zeroes it, which is what tells the flash that a
        // re-dealt board was not played into existence.
        moveCount={gd.stateLineData.nSwapsUsed}
      />

      <div className={styles.belowBoard}>
        {/* While inspecting a past swap the shared banner overlays this region,
            naming the swap. */}
        {historyView.isViewing && (
          <HistoryBanner label={historyView.label} actor={historyView.actor} onExit={historyView.exit} />
        )}
        {/* No below-board move controls: waffle's input is swapping tiles on the
            board itself, so `.moveArea` is empty. */}
        <div className={styles.moveArea} />
        {/* The LOCAL feedback slot — a reserved height keeps the top-anchored board
            from shifting as the pill (a refused swap / waiting / the verdict)
            appears/clears. The multi-line answer reveal is NOT here (it lives in the
            info column's `<SolutionReveal>` — it would overflow the viewport). */}
        <div className={shared.localFeedback}>
          <FeedbackPill slot={localFeedbackSlot} />
        </div>
      </div>
    </div>
  )
}
