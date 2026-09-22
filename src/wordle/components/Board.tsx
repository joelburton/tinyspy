// cs-met-wordle

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import { revealBorderVar, revealInkVar, revealVar, tileColor } from '../lib/colors'
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
  // While viewing, PlayArea also hands historical `rows` + `active={false}` +
  // no `pending`, and rows never flip (they're already-final history).
  isViewingHistory: boolean
  // Ring this row (the guess the viewed turn added), or -1 = none.
  // The row keeps its g/y/x tile colors; the ring just marks which one.
  historyLitBoardRow: number
  // Bumped by `<BoardCol>` on every soft reject — the active row shakes and
  // rings. The pill says WHAT was wrong; this says WHERE. Keyed into the row so
  // a repeat rejection replays the shake rather than doing nothing.
  rejectNonce: number
  // Which outcome that rejection carries. A default would be a second place
  // naming a refusal's word, and the caller is the one holding the answer; the
  // ring's color comes from the shared table, which is TOTAL over the
  // vocabulary, so the caller narrows nothing on the way down.
  rejectOutcome: Outcome
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
 * `flipBaseline` is the line between the two.
 */
export function Board({
  rows,
  current,
  pending,
  maxGuesses,
  active,
  brand,
  isViewingHistory,
  historyLitBoardRow,
  rejectNonce,
  rejectOutcome,
  gameOver,
  notMyTurn,
  myTurnJustStarted,
}: Props) {
  const activeIndex = active ? rows.length : -1
  // The row count that was already on the board, so anything past it is a guess
  // that landed while you were watching.
  //
  // It MOVES BACK, which is why it is state and not a mount-time count: a
  // restart deletes the guesses, and the replayed game's first rows would sit
  // below a stale baseline and never flip. Rows only shrink on a re-deal, so
  // that is the signal — adjusted during render, React's
  // adjust-state-when-input-changes shape.
  //
  // `!isViewingHistory` is load-bearing: a past turn's `rows` is usually
  // shorter than the live board, and letting the baseline drop to it would flip
  // half the board on the way back to live.
  const [flipBaseline, setFlipBaseline] = useState(rows.length)
  if (!isViewingHistory && rows.length < flipBaseline) setFlipBaseline(rows.length)

  return (
    <div className={cls(shared.boardSeal, styles.board)} style={{ ['--rows' as string]: maxGuesses }}>
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
              // The nonce rides in the active row's KEY: a CSS animation only
              // replays if its element is remounted.
              key={isActive ? `${r}-${rejectNonce}` : r}
              className={cls(
                styles.row,
                r === historyLitBoardRow && styles.historyRow,
                // The rejected word is still sitting in the active typing row —
                // it was never accepted, so it never became a submitted one.
                rejectNonce > 0 && isActive && shared.verdictRing,
                rejectNonce > 0 &&
                  isActive &&
                  VERDICT_TONE[rejectOutcome],
              )}
              role="row"
            >
              {Array.from({ length: 5 }, (_, c) => {
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
                // A judgment is the shared palette; an unjudged tile is this
                // board's own (an empty slot) — see tileColors.module.css.
                const colorClass = color === 'blank' ? styles.blank : tileColors[color]
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
