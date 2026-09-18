// cs-fixed-outcome-fix

import { FeedbackPill } from '@/common/feedback/FeedbackPill'
import { cls } from '@/common/utils/cls'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useTopFeedbackMessage } from '@/common/feedback/useFeedbackSlot'
import type { Coord } from '../lib/board'
import { MoveRow } from '@/common/word-entry/MoveRow'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { EntryBox } from '@/common/word-entry/EntryBox'
import { Board, type FoundPath } from './Board'
import { HintBar } from './HintBar'
import { HistoryBanner } from '@/common/event-log/HistoryBanner'
import type { Actor } from '@/common/members/member'
import history from '@/common/event-log/historyViewer.module.css'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'

type Props = {
  board: readonly string[]
  found: FoundPath[]
  // Words nobody found, shown only once the solution is revealed.
  missed: Coord[][]
  trace: readonly Coord[]
  hintCoords: Coord[] | null
  onTileClick: (at: Coord) => void
  disabled: boolean
  // The viewed turn's traced cells, ringed.
  historyLitTiles: Coord[]
  // What the banner says about the viewed turn — NULL when live, which is what
  // "am I viewing history?" is derived from (docs/playarea.md → Prop conventions).
  historyLabel: string | null
  /** Whose board is on screen, when it is not the viewer's own. */
  historyActor?: Actor | null
  onExitHistory: () => void
  // The word being traced, as text. Empty when nothing is selected.
  echo: string
  // Take back the last traced cell — ⌫ and the button, one binding.
  actDelete: BoundAction
  // Submit the trace — Enter and the button, one binding.
  actSubmit: BoundAction
  // Cells a typed letter matched when it matched several — ringed red for a beat.
  ambiguous: Coord[]
  // PlayArea's below-board slot. While it holds a message — a move's result,
  // the theme clue, whose turn, the verdict — the pill takes the move row's
  // place.
  localFeedbackSlot: FeedbackSlot
  // ── Hint economy ──
  hintPoints: number
  hintCost: number
  hintShowing: boolean
  // Cash a hint — the bar's button IS this binding.
  actHint: BoundAction
}

/**
 * strands' board column: the grid, the move-row/verdict slot, and the hint bar.
 *
 * The **move row and the pill share one fixed-height slot** because they are
 * mutually exclusive in time — you are either building a word or reading what
 * the last one did. (The same swap `<EntryRow>` makes; stackdown, whose pill
 * has a separate reserved row, is the odd one out.) Fixed height because the
 * slot empties between traces, and a collapsing row would bounce the board on
 * every submission (the no-reflow rule).
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
  historyLitTiles,
  historyLabel,
  historyActor,
  onExitHistory,
  echo,
  actDelete,
  actSubmit,
  ambiguous,
  localFeedbackSlot,
  hintPoints,
  hintCost,
  hintShowing,
  actHint,
}: Props) {
  const isViewingHistory = historyLabel !== null
  const top = useTopFeedbackMessage(localFeedbackSlot)
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
        isViewingHistory={isViewingHistory}
        historyLitTiles={historyLitTiles}
        ambiguous={ambiguous}
      />

      {/* While replaying, the banner takes the echo/pill slot: what you want
          there is "which turn am I looking at", and the slot is already the
          fixed-height row that answers "what just happened". Opaque surface +
          history-blue border is the shared viewing marker, matching the board frame
          and the log's ringed `#N`. */}
      {/* `bannerHost` only WHILE VIEWING — the banner is `position: absolute;
          inset: 0` and needs a positioning context, and without one it filled
          the board instead (the nearest positioned ancestor). Conditional
          rather than permanent so a `position` this row doesn't otherwise want
          isn't sitting on it during play — the same call codenamesduet /
          connections / psychicnum make. */}
      <div className={cls(styles.echoSlot, isViewingHistory && history.historyBannerHost)}>
        {isViewingHistory ? (
          <HistoryBanner label={historyLabel} actor={historyActor} onExit={onExitHistory} />
        ) : top !== null ? (
          <FeedbackPill slot={localFeedbackSlot} />
        ) : (
          /* The shared move row (docs/playarea.md → Text entry) around the
             traced word. strands can't use <EntryRow>: its string is DERIVED
             from the path (`wordFromPath`), so `value`/`onChange` run backwards
             — a keystroke here resolves to a CELL, not to a character. What it
             shares is the row, the EntryBox and the two buttons, which is what
             makes it the same control players learned elsewhere.

             The buttons are the pointer twins of Backspace and Enter, and the
             real gain is touch: on a phone there is no keyboard, so this is the
             ONLY way to submit — load-bearing rather than a convenience. */
          <MoveRow className={styles.moveRow} actDelete={actDelete} actSubmit={actSubmit}>
            <EntryBox value={echo} className={styles.echo} />
          </MoveRow>
        )}
      </div>

      <HintBar
        points={hintPoints}
        cost={hintCost}
        showing={hintShowing}
        actHint={actHint}
      />
    </div>
  )
}
