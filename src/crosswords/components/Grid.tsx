// cs-unmet

import { useMemo } from 'react'
import shared from '@/common/game-page/playArea.module.css'
import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/ending/gameEnding'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import { makeCellId } from '../lib/cellId'
import { computeBorderMask } from '../lib/cursor'
import type { GGridEntry } from '../reactTypes'
import type { GBoard, GPuzzleTemplate, GSolution } from '../types'
import { Cell } from './Cell'
import { RebusBox } from './RebusBox'
import styles from './Grid.module.css'

// Board sizing — a single computed cell size, everything else in `em`.
// TWO formulas, picked by the CSS breakpoint (Grid.module.css): desktop
// shares the width with the clue columns (targetWidthPercent); below
// --mobile the clue lists are off-canvas, so the grid takes the full
// viewport width instead. The vertical reserves cover what sits above/below
// the board (the game chrome; on mobile also the active-clue bar) so the
// board never exceeds the layout height and pushes the page into scrolling.
const VERTICAL_OVERHEAD_PX = 112
// Mobile: chrome (~80px) + the reserved active-clue bar (≤3 lines ≈ 73px) +
// layout gap + page padding. Width usually binds on a portrait device, so
// this only needs to be safe, not tight.
const MOBILE_VERTICAL_OVERHEAD_PX = 180
const MAX_CELL_PX = 60

/** Board takes ~half the viewport width (50% at 15 cols, ramping to 55% at
 *  21) — roomy enough that on a typical desktop the HEIGHT term of the min()
 *  binds instead, i.e. the grid grows to the full available height. */
function makeTargetWidthPercent(width: number): number {
  return Math.max(50, Math.min(55, 50 + (width - 15) * (5 / 6)))
}

/** The marks the page puts on cells, each by cell id. */
type GridMarks = {
  // The cells of the word under the cursor.
  wordCellIds: Set<string>
  // A teammate's cursor (coop): the cell → their CSS color.
  peerCursorColors: Map<string, string>
  // A teammate's fresh fill (coop): the cell → their CSS color.
  fillFlashColors: Map<string, string>
  // How I came out, for the ended grid's frame; null while I still play.
  endingOutcome: EndOutcome | null
}

type Props = {
  puzzle: GPuzzleTemplate
  // The board as drawn, my pending writes included.
  board: GBoard
  // Typing on the grid: the cursor, the rebus box, the peek, the click.
  entry: GGridEntry
  marks: GridMarks
  // The answer key, drawn over the fills while this viewer has "Reveal
  // solution" on; null otherwise.
  solution: GSolution | null
  // Display-only: a multi-letter rebus drawn as its first letter.
  collapseRebus: boolean
}

/**
 * The crossword grid: every square of the puzzle, each cell handed what it
 * shows — the puzzle's facts, the board's fill and flags, the solution's
 * letter while it is shown, and the marks the page puts on it — and the rebus
 * box or the peek over the cursor cell.
 */
export function Grid({ puzzle, board, entry, marks, solution, collapseRebus }: Props) {
  const { width, height, cells: puzzleCells } = puzzle

  // The grid lines depend only on the puzzle's shape, which never changes.
  const masks = useMemo(
    () => puzzleCells.map((row, r) => row.map((_, c) => computeBorderMask(puzzleCells, r, c))),
    [puzzleCells],
  )

  // Both breakpoints' cell sizes ride along as custom properties; the CSS
  // module picks one per breakpoint (`.board { font-size: var(…) }`), so the
  // desktop formula is untouched and there's no JS media query here.
  // `svh` (not `dvh`) to match the rest of the app — the game's own
  // PlayArea.module.css sizes the play area with `100svh`, and a game shouldn't
  // disagree with itself about which viewport unit it uses. On desktop the two
  // resolve identically (no retracting mobile toolbar); the choice only shows on
  // a mobile browser, where `svh` is the app-wide convention (docs/mobile.md).
  const cellSize = `min(calc(${makeTargetWidthPercent(width)}vw / ${width}), calc((100svh - ${VERTICAL_OVERHEAD_PX}px) / ${height}), ${MAX_CELL_PX}px)`
  const cellSizeMobile = `min(calc((100vw - 2 * var(--page-padding-x)) / ${width}), calc((100svh - ${MOBILE_VERTICAL_OVERHEAD_PX}px) / ${height}), ${MAX_CELL_PX}px)`

  const { cursor, rebus, peek } = entry

  return (
    <div
      className={cls(
        shared.boardSeal,
        styles.board,
        // No history viewer here, so the frame never steps aside for one. No
        // space is reserved for it: the outline may run a little past the
        // viewport.
        makeEndingFrameClasses(marks.endingOutcome, false),
      )}
      style={{
        ['--cw-cell' as string]: cellSize,
        ['--cw-cell-mobile' as string]: cellSizeMobile,
        gridTemplateColumns: `repeat(${width}, 1em)`,
      }}
    >
      {puzzleCells.map((row, r) =>
        row.map((pc, c) => {
          const id = makeCellId(r, c)
          if (pc.kind === 'block') {
            return <Cell key={id} kind="block" mask={masks[r]![c]!} hidden={pc.hidden === true} />
          }
          const given = pc.given === true
          // A given has no place on the board.
          const cell = given ? undefined : board.cellsById[id]
          const playersFill = given ? (pc.fill ?? null) : (cell?.fill ?? null)
          // The author's letter, while the solution is shown. A given is the
          // author's already.
          const solutionLetter = solution && !given ? (solution[r]?.[c]?.[0] ?? null) : null
          return (
            <Cell
              key={id}
              kind="cell"
              mask={masks[r]![c]!}
              row={r}
              col={c}
              number={pc.number}
              fill={solutionLetter ?? playersFill}
              given={given}
              isSolutionLetter={solutionLetter !== null && solutionLetter !== playersFill}
              pencil={cell?.pencil ?? false}
              revealed={cell?.revealed ?? false}
              wrong={(cell?.wrong ?? false) && solutionLetter === null}
              circled={pc.circled === true}
              shaded={pc.shaded === true}
              markRight={cell?.markRight ?? null}
              markBottom={cell?.markBottom ?? null}
              collapseRebus={collapseRebus}
              isCursor={r === cursor.row && c === cursor.col}
              isInWord={marks.wordCellIds.has(id)}
              peerColor={marks.peerCursorColors.get(id) ?? null}
              flashColor={marks.fillFlashColors.get(id) ?? null}
              onClick={entry.clickCell}
            />
          )
        }),
      )}
      {rebus ? (
        <RebusBox
          kind="entry"
          row={rebus.row}
          col={rebus.col}
          gridWidth={width}
          initial={rebus.initial}
          onSubmit={entry.submitRebus}
          onCancel={entry.cancelRebus}
        />
      ) : (
        peek && <RebusBox kind="peek" row={peek.row} col={peek.col} gridWidth={width} value={peek.value} />
      )}
    </div>
  )
}
