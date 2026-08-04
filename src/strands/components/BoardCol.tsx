import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import type { GenericFeedbackMsg } from '../../common/lib/games'
import type { Coord } from '../lib/board'
import { Board, type FoundPath } from './Board'
import { HintBar } from './HintBar'
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
      />

      <div className={styles.echoSlot}>
        {pill ? (
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
