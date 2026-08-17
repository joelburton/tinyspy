import { useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import { revealBorderVar, revealVar, tileColor } from '../lib/colors'
import shared from '../../common/components/game/PlayArea.module.css'
import history from '../../common/components/game/lists/historyViewer.module.css'
import styles from './Board.module.css'

/** Per-tile stagger so a row's letters flip left-to-right, not at once. */
const REVEAL_STEP_S = 0.22

type SubmittedRow = { guess: string; colors: string }

type Props = {
  /** Submitted guesses (letters + their g/y/x colors), in order. */
  rows: SubmittedRow[]
  /** The active typing row's current letters (empty when not the
   *  player's turn / game over). Rendered just below the submitted
   *  rows, with no colors yet. */
  current: string
  /** A just-submitted word awaiting its colored server row. Shown in the
   *  next slot as an uncolored (filled) row so the letters stay put
   *  during the round-trip; when the real row lands it flips in place.
   *  Empty when there's nothing in flight. */
  pending: string
  /** Total rows to draw — the guess budget (`max_guesses`). */
  maxGuesses: number
  /** Whether the active typing row should show (game still in play for
   *  this player). */
  active: boolean
  /** Brand name (from the manifest, via `ctx.brand`) for the grid's
   *  screen-reader label — kept out of this chunk's source so the brand
   *  lives only in the manifest. */
  brand: string
  /** Turn-history: wear the shared yellow viewing frame and make the board
   *  click-through (so a board click falls to the document exit listener).
   *  While viewing, PlayArea also hands historical `rows` + `active={false}` +
   *  no `pending`, and rows never flip (they're already-final history). */
  viewing?: boolean
  /** Turn-history: ring this row (the guess the viewed turn added), or -1 = none.
   *  The row keeps its g/y/x tile colors; the ring just marks which one. */
  highlightRow?: number
  /** Bumped by `<BoardCol>` on every soft reject — the active row shakes and
   *  rings amber. The pill says WHAT was wrong; this says WHERE. Keyed into the
   *  row so a repeat rejection replays the shake rather than doing nothing. */
  rejectNonce?: number
  /** Which tone that rejection carries — the SAME tone as its pill, so the two
   *  halves of one message agree. */
  rejectTone?: 'error' | 'warning'
  /** The game is finished, and how it ended — the board takes a band in that
   *  outcome's gray (neutral for a game merely ended), null while it's live. The
   *  same mark waffle wears; see docs/tile-feedback.md. */
  gameOver?: 'won' | 'lost' | 'neutral' | null
  /** A teammate holds the move (turn-order coop): dim the whole board. */
  notMyTurn?: boolean
  /** True for a beat at the moment the turn becomes mine — flash the frame. */
  myTurnJustStarted?: boolean
}

/**
 * The Wordle board: `maxGuesses` rows of 5 tiles. A submitted row shows
 * each letter on its server-computed color (green/yellow/gray); the
 * active row shows the player's in-progress typing (uncolored); the
 * rest are empty. Colors come from `common.wordle_colors` server-side
 * — the FE only renders them (it never holds the target).
 *
 * **Reveal animation.** When a guess lands, its row's tiles flip over
 * one at a time (NYT-style), each painting its color at the midpoint of
 * the flip. We animate only rows that *appear after this component
 * mounts* — rows already present at mount (a mid-game refresh, or the
 * opponent's revealed history) render in their final color without
 * re-flipping. `firstRows` captures that initial count once; any row at
 * an index ≥ it is "new" and flips. The static color class is omitted on
 * flipping tiles — the keyframes (with `forwards`) hold the final color —
 * so each tile reads blank until its flip reaches halfway.
 */
export function Board({
  rows,
  current,
  pending,
  maxGuesses,
  active,
  brand,
  viewing = false,
  highlightRow = -1,
  rejectNonce = 0,
  rejectTone = 'error',
  gameOver = null,
  notMyTurn = false,
  myTurnJustStarted = false,
}: Props) {
  const activeIndex = active ? rows.length : -1
  // Rows that were ALREADY THERE don't flip — only guesses that land while you
  // are watching. The baseline is the row count we consider "already there", and
  // it starts at whatever was on the board when this mounted (a mid-game refresh,
  // or an opponent's revealed history, shouldn't re-play six flips at you).
  //
  // It has to MOVE BACK when the board is re-dealt, which is the whole reason
  // this isn't a mount-time constant: a restart deletes the guesses, so a
  // replayed game's first guesses would sit below a stale baseline and land with
  // no flip at all. The cause is right there in the data — the log SHRANK, which
  // nothing but a re-deal does — so the baseline follows it down, adjusted during
  // render (React's adjust-state-when-input-changes shape).
  //
  // `!viewing` is load-bearing: while a past turn is open, `rows` is that
  // snapshot and is often shorter than the live board. Letting the baseline drop
  // to a snapshot's length would flip half the board on the way back to live.
  const [flipBaseline, setFlipBaseline] = useState(rows.length)
  if (!viewing && rows.length < flipBaseline) setFlipBaseline(rows.length)

  return (
    <div className={styles.board} style={{ ['--rows' as string]: maxGuesses }}>
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          viewing && history.frame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns rather than nest: the
          // viewer owns it while open, being the state you chose and can leave.
          gameOver !== null && !viewing && shared.gameOverFrame,
          gameOver === 'won' && !viewing && shared.gameOverWon,
          gameOver === 'lost' && !viewing && shared.gameOverLost,
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
          const flipping = !viewing && !!submitted && r >= flipBaseline
          return (
            <div
              // The nonce rides in the KEY of the active row: a CSS animation
              // only replays if the element is remounted, and rejecting the
              // same word twice must shake twice.
              key={isActive ? `${r}-${rejectNonce}` : r}
              className={cls(
                styles.row,
                r === highlightRow && styles.viewedRow,
                // The rejected word is still sitting in the active typing row —
                // it was never accepted, so it never became a submitted one.
                rejectNonce > 0 && isActive && shared.verdictRing,
                rejectNonce > 0 &&
                  isActive &&
                  (rejectTone === 'warning' ? shared.verdictWarning : shared.verdictError),
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
                      flipping ? styles.reveal : styles[color],
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
