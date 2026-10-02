// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import shared from '@/common/game-page/playArea.module.css'
import { makeEndingFrameClasses } from '@/common/game-page/makeEndingFrameClasses'
import history from '@/common/event-log/historyViewer.module.css'
import type { HistoryView } from '../hooks/useHistoryView'
import { useFlipBaseline } from '../hooks/useFlipBaseline'
import { WORD_LENGTH } from '../lib/setup'
import type { BoardRow } from '../lib/board'
import { LetterRow } from './LetterRow'
import styles from './Board.module.css'

/** What is on the board. */
export type BoardGrid = {
  // The guesses the server has drawn, in order: every guess on coop's shared
  // board, my own in compete.
  liveRows: BoardRow[]
  // The guess budget, and so the rows the board has.
  maxGuesses: number
}

/** What the board wears on and around its rows. */
export type BoardMarks = {
  // The letters being typed into the next row.
  typedWord: string
  // My guess out with the server, drawn uncolored in the next row until its
  // colored row lands; null when nothing is out.
  inFlightGuess: string | null
  // A refused guess: the typing row rings and shakes in its outcome.
  refusedGuessMark: Mark<Outcome> | null
  // The ending that applies to me; null while I play.
  endingOutcome: EndOutcome | null
  // A teammate holds the move.
  isWaitingForTurn: boolean
  // True for a beat as the turn becomes mine.
  myTurnJustStarted: boolean
}

/**
 * The wordle board: `maxGuesses` rows of five tiles. A guessed row shows each
 * letter on its server-computed color; the typing row shows what is being
 * typed, uncolored; the rest are empty. The colors are
 * `common._wordle_colors`'s — this board draws them and never holds the target.
 *
 * A row that LANDS while you are watching turns its tiles over one at a time
 * (`useFlipBaseline` says which rows those are). A past turn open on the board
 * draws its own rows in place of the live ones, never flips, and rings the row
 * that turn added.
 */
export function Board({
  grid,
  marks,
  historyView,
  canType,
  brand,
}: {
  grid: BoardGrid
  marks: BoardMarks
  historyView: HistoryView
  // The typing row shows: the game lets me guess, and the live board is on
  // screen.
  canType: boolean
  // Brand name (manifest) for the grid's `aria-label`, a test handle.
  brand: string
}) {
  const shownRows = historyView.rows ?? grid.liveRows
  const typingRowIndex = canType ? shownRows.length : -1
  const flipBaseline = useFlipBaseline(grid.liveRows.length, historyView.isViewing)

  return (
    <div
      className={cls(shared.boardSeal, styles.board)}
      // The grid's shape, for the stylesheet's aspect ratio and row template.
      style={{ ['--rows' as string]: grid.maxGuesses, ['--cols' as string]: WORD_LENGTH }}
    >
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          historyView.isViewing && history.historyFrame,
          marks.isWaitingForTurn && !canType && shared.dimNotYourTurn,
          marks.myTurnJustStarted && shared.yourTurnFlash,
          makeEndingFrameClasses(marks.endingOutcome, historyView.isViewing),
        )}
        role="grid"
        aria-label={`${brand} board`}
        data-board
      >
        {Array.from({ length: grid.maxGuesses }, (_, rowIndex) => {
          const guessRow = shownRows[rowIndex]
          const isTypingRow = rowIndex === typingRowIndex
          // The in-flight word sits in the first empty row.
          const isInFlightRow =
            !guessRow && marks.inFlightGuess !== null && rowIndex === shownRows.length
          const refusedGuessMark = isTypingRow ? marks.refusedGuessMark : null

          // What the row's tiles spell: its guess, the word out with the
          // server, or what is being typed.
          function getRowWord(): string {
            if (guessRow) return guessRow.guess
            if (isInFlightRow) return marks.inFlightGuess!
            if (isTypingRow) return marks.typedWord
            return ''
          }

          return (
            <LetterRow
              // The mark's nonce rides in the KEY: a CSS animation only
              // replays if its element is remounted.
              key={refusedGuessMark ? `${rowIndex}-${refusedGuessMark.nonce}` : rowIndex}
              word={getRowWord()}
              colors={guessRow?.colors ?? null}
              marks={{
                // A past turn's rows are final, so they never flip.
                isFlipping: !historyView.isViewing && !!guessRow && rowIndex >= flipBaseline,
                isInFlight: isInFlightRow,
                isHistoryLit: rowIndex === historyView.litBoardRow,
                refusedGuessMark,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
