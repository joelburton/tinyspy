import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { cls } from '../../common/lib/util/cls'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { Coord } from '../lib/board'
import { Board, type FoundPath } from './Board'
import { HintBar } from './HintBar'
import history from '../../common/components/game/lists/historyViewer.module.css'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'

type Props = {
  board: readonly string[]
  found: FoundPath[]
  /** Words nobody found, shown only once the solution is revealed. */
  missed: Coord[][]
  trace: readonly Coord[]
  hintCoords: Coord[] | null
  onTileClick: (at: Coord) => void
  disabled: boolean
  /** Replaying a past turn. */
  viewing: boolean
  /** The viewed turn's traced cells, ringed. */
  highlight: Coord[]
  /** What the banner says about the viewed turn. */
  viewingDescription: string
  onExitViewing: () => void
  /** The word being traced, as text. Empty when nothing is selected. */
  echo: string
  /** The pill that replaces the echo: an own-move verdict, or the terminal one. */
  pill: GenericFeedbackMsg | null
  onDismissPill: () => void
  // ── Hint economy ──
  hintPoints: number
  hintCost: number
  hintShowing: boolean
  onSpendHint: () => void
}

/**
 * strands' board column: the grid, the echo/verdict slot, and the hint bar.
 *
 * The **echo and the pill share one fixed-height slot** because they are
 * mutually exclusive in time — you are either building a word or reading what
 * the last one did. Fixed height because the slot empties between traces, and a
 * collapsing row would bounce the board on every submission (the no-reflow
 * rule).
 *
 * The **hint bar lives here rather than in the info column**, deliberately: on a
 * phone the info column goes off-canvas into the InfoSheet, and the hint economy
 * is core play, not a readout you check occasionally.
 */
export function BoardCol({
  board,
  found,
  missed,
  trace,
  hintCoords,
  onTileClick,
  disabled,
  viewing,
  highlight,
  viewingDescription,
  onExitViewing,
  echo,
  pill,
  onDismissPill,
  hintPoints,
  hintCost,
  hintShowing,
  onSpendHint,
}: Props) {
  return (
    <div className={shared.boardCol}>
      <Board
        board={board}
        found={found}
        missed={missed}
        trace={trace}
        hintCoords={hintCoords}
        onTileClick={onTileClick}
        disabled={disabled}
        viewing={viewing}
        highlight={highlight}
      />

      {/* While replaying, the banner takes the echo/pill slot: what you want
          there is "which turn am I looking at", and the slot is already the
          fixed-height row that answers "what just happened". Opaque surface +
          yellow border is the shared viewing marker, matching the board frame
          and the log's ringed `#N`. */}
      {/* `bannerHost` only WHILE VIEWING — the banner is `position: absolute;
          inset: 0` and needs a positioning context, and without one it filled
          the board instead (the nearest positioned ancestor). Conditional
          rather than permanent so a `position` this row doesn't otherwise want
          isn't sitting on it during play — the same call codenamesduet /
          connections / psychicnum make. */}
      <div className={cls(styles.echoSlot, viewing && history.bannerHost)}>
        {viewing ? (
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
        ) : pill ? (
          <GenericFeedbackPill msg={pill} onClose={onDismissPill} />
        ) : (
          <span className={styles.echo}>{echo}</span>
        )}
      </div>

      <HintBar
        points={hintPoints}
        cost={hintCost}
        showing={hintShowing}
        disabled={disabled}
        onSpend={onSpendHint}
      />
    </div>
  )
}
