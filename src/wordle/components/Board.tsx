// cs-blessed-wordle

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { Mark } from '@/common/board-marks/useMark'
import { OUTCOME_TO_VERDICT_CLASS } from '@/common/game-page/outcomeToVerdictClass'
import { revealBorderVar, revealInkVar, revealVar, tileColor } from '../lib/colors'
import { WORD_LENGTH } from '../lib/setup'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import tileColors from '@/shared/wordle-style/tileColors.module.css'
import styles from './Board.module.css'

/** Per-tile stagger so a row's letters flip left-to-right, not at once. */
const REVEAL_STEP_S = 0.22

type SubmittedRow = { guess: string; colors: string }

type Props = {
  // Submitted guesses (letters + their g/y/x colors), in order.
  rows: SubmittedRow[]
  // How many rows the LIVE board has, even while `rows` is a past turn's
  // snapshot — where the flip line moves to when a past turn opens.
  liveRowCount: number
  // The active typing row's current letters (empty when not the
  // player's turn / game over). Rendered just below the submitted
  // rows, with no colors yet.
  current: string
  // A just-submitted word awaiting its colored server row. Shown in the
  // next slot as an uncolored (filled) row so the letters stay put
  // during the round-trip; when the real row lands it flips in place.
  // Empty when there's nothing in flight.
  pending: string
  // Total rows to draw — the guess budget (`max_guesses`).
  maxGuesses: number
  // Whether the active typing row should show (game still in play for
  // this player).
  active: boolean
  // Brand name (via `ctx.brand`) for the grid's label — a prop because the
  // brand lives in the manifest and nowhere in this chunk's source.
  brand: string
  // Wear the shared viewing frame and make the board
  // click-through (so a board click falls to the document exit listener).
  // While viewing, BoardCol also hands the snapshot's `rows` + `active={false}`
  // + no `pending`, and rows never flip (they're already-final history).
  isViewingHistory: boolean
  // Ring this row (the guess the viewed turn added), or -1 = none.
  // The row keeps its g/y/x tile colors; the ring just marks which one.
  historyLitBoardRow: number
  // `<BoardCol>`'s refusal mark, or null for a board saying nothing — the active
  // row rings and shakes in the outcome the mark carries. The pill says WHAT was
  // wrong; this says WHERE. The row keys on the mark's nonce so a repeat
  // rejection replays the shake rather than doing nothing.
  reject: Mark<Outcome> | null
  // The game is finished, and how it ended — the board takes a band in that
  // outcome's gray (neutral for a game merely ended), null while it's live.
  // The shared board-scope mark; see common/board-marks/doc.md.
  gameOver: TerminalOutcome | null
  // A teammate holds the move (turn-order coop): dim the whole board.
  notMyTurn: boolean
  // True for a beat at the moment the turn becomes mine — flash the frame.
  myTurnJustStarted: boolean
}

/**
 * The wordle board: `maxGuesses` rows of five tiles. A submitted row shows each
 * letter on its server-computed color; the active row shows what is being
 * typed, uncolored; the rest are empty. The colors are `common.wordle_colors`'s
 * — this board draws them and never holds the target.
 *
 * **The reveal flip.** A row that LANDS while you are watching turns its tiles
 * over one at a time, each painting its color at the midpoint of its own flip.
 * Rows that were already on the board when this mounted — a mid-game refresh,
 * an opponent's history — draw in their final color without flipping, and
 * `flipBaseline` is the line between the two. Opening a past turn moves the
 * line up to the live rows as they stood, so coming back flips only a row that
 * landed while you were away.
 */
export function Board({
  rows,
  liveRowCount,
  current,
  pending,
  maxGuesses,
  active,
  brand,
  isViewingHistory,
  historyLitBoardRow,
  reject,
  gameOver,
  notMyTurn,
  myTurnJustStarted,
}: Props) {
  const activeIndex = active ? rows.length : -1
  // The row count that was already on the board when it mounted, so anything
  // past it is a guess that landed while you were watching. The live rows only
  // grow, and a Restart remounts the whole surface (GamePage keys it on
  // `restarts`), so a replayed game starts at zero.
  const [flipBaseline, setFlipBaseline] = useState(rows.length)
  // Opening a past turn draws the snapshot's rows in place of the live ones,
  // so coming back mounts the live rows fresh — and each would flip again. The
  // line moves up to the live rows as the viewer opens. Compared against the
  // previous render's value in state, React's pattern for adjusting state to a
  // prop change, which holds under StrictMode's double render.
  const [wasViewingHistory, setWasViewingHistory] = useState(isViewingHistory)
  if (isViewingHistory !== wasViewingHistory) {
    setWasViewingHistory(isViewingHistory)
    if (isViewingHistory) setFlipBaseline(liveRowCount)
  }

  return (
    <div
      className={cls(shared.boardSeal, styles.board)}
      // The grid's shape, for the stylesheet's aspect ratio and row template.
      style={{ ['--rows' as string]: maxGuesses, ['--cols' as string]: WORD_LENGTH }}
    >
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          isViewingHistory && history.historyFrame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns rather than nest: the
          // viewer owns it while open, being the state you chose and can leave.
          gameOver !== null && !isViewingHistory && shared.gameOverFrame,
          gameOver === 'won' && !isViewingHistory && shared.gameOverWon,
          gameOver === 'lost' && !isViewingHistory && shared.gameOverLost,
        )}
        role="grid"
        aria-label={`${brand} board`}
        data-board
      >
        {Array.from({ length: maxGuesses }, (_, r) => {
          const submitted = rows[r]
          const isActive = r === activeIndex
          // The pending (in-flight) word sits in the first empty slot.
          const isPending = !submitted && !!pending && r === rows.length
          // Historical rows never flip — they're already-final, not fresh guesses.
          const flipping = !isViewingHistory && !!submitted && r >= flipBaseline
          return (
            <div
              // The mark's nonce rides in the active row's KEY: a CSS animation
              // only replays if its element is remounted.
              key={isActive && reject ? `${r}-${reject.nonce}` : r}
              className={cls(
                styles.row,
                r === historyLitBoardRow && styles.historyRow,
                // The rejected word is still sitting in the active typing row —
                // it was never accepted, so it never became a submitted one.
                isActive && reject && shared.verdictRing,
                isActive && reject && OUTCOME_TO_VERDICT_CLASS[reject.value],
              )}
              role="row"
            >
              {Array.from({ length: WORD_LENGTH }, (_, c) => {
                let letter = ''
                let color = tileColor(undefined)
                if (submitted) {
                  letter = submitted.guess[c] ?? ''
                  color = tileColor(submitted.colors[c])
                } else if (isPending) {
                  letter = pending[c] ?? ''
                } else if (isActive) {
                  letter = current[c] ?? ''
                }
                // A judgment is the shared palette; an unjudged tile wears no
                // color class at all — the grid's own tokens are what an empty
                // slot looks like. See tileColors.module.css.
                const colorClass = color === 'blank' ? undefined : tileColors[color]
                return (
                  <div
                    key={c}
                    className={cls(
                      // The FACE only — wordle's tiles are inert (a rendered
                      // guess, never a control), so they take the shared box and
                      // none of the shared interaction chrome.
                      shared.tileFace,
                      styles.tile,
                      // Flipping tiles take their color from the keyframes
                      // (via --reveal-bg), not the static color class.
                      flipping ? styles.reveal : colorClass,
                      letter && color === 'blank' && styles.filled,
                      // Sent, waiting on the server — the middle gray under the
                      // shared in-flight dim, matching waffle's two cells.
                      isPending && styles.inFlight,
                      isPending && shared.dimInFlight,
                    )}
                    style={
                      flipping
                        ? {
                            ['--reveal-bg' as string]: revealVar(color),
                            ['--reveal-border' as string]: revealBorderVar(color),
                            ['--reveal-ink' as string]: revealInkVar(color),
                            animationDelay: `${c * REVEAL_STEP_S}s`,
                          }
                        : undefined
                    }
                    role="gridcell"
                  >
                    <span className={styles.letter}>{letter.toUpperCase()}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
