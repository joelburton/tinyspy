import type { GenericFeedbackMsg } from '../../common/lib/games'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { WaffleGrid } from './WaffleGrid'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './BoardCol.module.css'

/** waffle's pills are never closeable (the × is never rendered), but the shared
 *  `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/**
 * waffle's board column — the square `WaffleGrid` plus the below-board region (the
 * feedback pill + the turn-viewer banner). The move IS the board (tap two tiles to
 * swap), so there are no below-board input controls — `onSwap` is the one committed
 * action up. Like the other games' BoardCol, it does NOT own game state: PlayArea
 * hands it **the board to render** (the live board OR a historical snapshot) + a
 * `readOnly` flag, which is what makes the turn-history viewer a drop-in. See
 * docs/playarea-decomposition-plan.md.
 */
export function BoardCol({
  board,
  colors,
  readOnly,
  highlight,
  viewingDescription,
  onExitViewing,
  onSwap,
  localPill,
}: {
  // ── Board to render (live OR a historical snapshot — PlayArea picks) ──
  /** 25-char board string, holes '.'. */
  board: string
  /** 25-char g/y/x colors (server-computed live, FE-computed for a snapshot), or null. */
  colors: string | null
  /** Board inert (terminal / not a player / locally done / viewing a past swap). */
  readOnly: boolean
  /** Turn-history: the two cells the viewed swap moved — ring them (undefined live). */
  highlight: ReadonlySet<number> | undefined

  // ── History viewer (its overlay lives in the below-board region) ──
  /** The viewed swap's description while inspecting history (drives the banner + the
   *  yellow frame), or null when live. */
  viewingDescription: string | null
  /** Return to the live board (a board/banner click, or the ✕). */
  onExitViewing: () => void

  // ── Move ──
  /** Swap the letters of two filled cells — the one committed action up. */
  onSwap: (a: number, b: number) => void

  // ── Below-board own-move feedback (PlayArea computes the pill) ──
  /** The below-board pill to show (terminal verdict / waiting / own-move error), or null. */
  localPill: GenericFeedbackMsg | null
}) {
  const viewing = viewingDescription !== null

  return (
    // Exit-on-click is intrinsic to the viewer now (useHistoryViewer's document
    // listener + the click-through `.frame`), so the board column needs no click
    // handler — a click anywhere returns to live.
    <div className={shared.boardCol}>
      <WaffleGrid
        board={board}
        colors={colors}
        disabled={readOnly}
        viewing={viewing}
        highlight={highlight}
        onSwap={onSwap}
      />

      <div className={styles.belowBoard}>
        {/* Turn-viewer banner — while inspecting a past swap it overlays the
            below-board region with the swap's description. Opaque surface + yellow
            border = the shared "viewing history" marker (matching the board frame +
            viewed-row outline). Click anywhere / the ✕ returns to live. */}
        {viewing && (
          <div className={history.banner} onClick={onExitViewing} title="Click to exit">
            <span className={history.bannerLabel}>{viewingDescription}</span>
            <button
              type="button"
              className={history.bannerExit}
              onClick={(e) => {
                e.stopPropagation()
                onExitViewing()
              }}
              aria-label="Exit viewing"
            >
              ✕
            </button>
          </div>
        )}
        {/* No below-board move controls: waffle's input is swapping tiles on the
            board itself, so `.moveArea` is empty. */}
        <div className={styles.moveArea} />
        {/* The LOCAL feedback slot — a reserved height keeps the top-anchored board
            from shifting as the pill (own-action error / waiting / terminal verdict)
            appears/clears. The multi-line answer reveal is NOT here (it lives in the
            info column's `.terminalExtra` — it would overflow the viewport). */}
        <div className={shared.localFeedback}>
          {localPill && <GenericFeedbackPill msg={localPill} onClose={noop} />}
        </div>
      </div>
    </div>
  )
}
