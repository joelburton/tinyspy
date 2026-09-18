// cs-fixed-outcome-fix

import type { ReactNode } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { MobileStatusBar } from '@/common/info-sheet/MobileStatusBar'
import { Board } from './Board'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import shared from '@/common/game-page/playArea.module.css'
import styles from './BoardCol.module.css'

/**
 * waffle's board column — the square `Board` plus the below-board region (the
 * feedback pill + the turn-viewer banner). The move IS the board (tap two tiles to
 * swap), so there are no below-board input controls — `onSwap` is the one committed
 * action up. Like the other games' BoardCol, it does NOT own game state: PlayArea
 * hands it **the board to render** (the live board OR a historical snapshot) + a
 * `readOnly` flag, which is what makes the turn-history viewer a drop-in. See
 * docs/playarea.md.
 */
export function BoardCol({
  mobileStatus,
  board,
  colors,
  readOnly,
  historyLitTiles,
  historyLabel,
  historyActor,
  onExitHistory,
  onSwap,
  pendingSwap,
  notMyTurn,
  myTurnJustStarted,
  gameOver,
  moveCount,
  localFeedbackSlot,
}: {
  // ── Mobile-only status strip ──
  // The core state readout (the `<StateLine>` the InfoCol also renders), shown
  // above the board ONLY below the `--mobile` breakpoint — where the info
  // column is off-canvas in the InfoSheet and would otherwise take a tap to
  // read. Hidden by CSS on desktop; see `<MobileStatusBar>`.
  mobileStatus: ReactNode

  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  // 25-char board string, holes '.'.
  board: string
  // 25-char g/y/x colors (server-computed live, FE-computed for a snapshot), or null.
  colors: string | null
  // Board inert (terminal / not a player / locally done / viewing a past swap).
  readOnly: boolean
  // The two tiles the viewed swap moved — ring them (undefined while live).
  historyLitTiles: ReadonlySet<number> | undefined

  // ── History viewer (its overlay lives in the below-board region) ──
  // The viewed swap's description while inspecting history (drives the banner + the
  // gray-blue frame), or null when live.
  historyLabel: string | null
  /** Whose board is on screen, when it is not the viewer's own. */
  historyActor?: Actor | null
  // Return to the live board (a board/banner click, or the ✕).
  onExitHistory: () => void

  // ── Move ──
  // Swap the letters of two filled cells — the one committed action up.
  onSwap: (a: number, b: number) => void
  // The swap currently in flight (its two cells take the in-flight dim; input is
  // gated), or null. See PlayArea's `pendingSwap`.
  pendingSwap: readonly [number, number] | null
  // Turn-order coop: a teammate holds the move, so the whole board dims.
  notMyTurn: boolean
  // True for a beat at the moment the turn becomes mine — the board frame
  // flashes yellow. Always false in a free-for-all game.
  myTurnJustStarted: boolean
  // The game is finished, and how it ended — the board's permanent band takes
  // that outcome's gray. Null while it's live.
  gameOver: TerminalOutcome | null
  // Swaps recorded for the board on show — the CAUSE the attention flash reads,
  // so a re-dealt or revealed board doesn't light up. See `<Board>`.
  moveCount: number

  // ── Below-board feedback ──
  // PlayArea's below-board slot — a refused swap, "you're out", whose turn,
  // the verdict. Drawn in the reserved-height slot under the board.
  localFeedbackSlot: FeedbackSlot
}) {
  const isViewingHistory = historyLabel !== null

  return (
    // Exit-on-click is intrinsic to the viewer now (useHistoryViewer's document
    // listener + the click-through `.historyFrame`), so the board column needs no click
    // handler — a click anywhere returns to live.
    <div className={shared.boardCol}>
      {/* Mobile only (CSS-hidden on desktop, where the info column carries it):
          the live swaps/par readout, above the board. It's a fixed-height row,
          and waffle's square board sizes off `--avail-h` — so Board.module.css
          subtracts this row's height there too, or the square would overflow
          the viewport (the hard no-scroll invariant). */}
      <MobileStatusBar>{mobileStatus}</MobileStatusBar>
      <Board
        board={board}
        colors={colors}
        disabled={readOnly}
        isViewingHistory={isViewingHistory}
        historyLitTiles={historyLitTiles}
        onSwap={onSwap}
        pendingSwap={pendingSwap}
        notMyTurn={notMyTurn}
        myTurnJustStarted={myTurnJustStarted}
        gameOver={gameOver}
        moveCount={moveCount}
      />

      <div className={styles.belowBoard}>
        {/* While inspecting a past swap the shared banner overlays this region,
            naming the swap. */}
        {isViewingHistory && (
          <HistoryBanner label={historyLabel} actor={historyActor} onExit={onExitHistory} />
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
