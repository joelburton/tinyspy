// cs-fixed-outcome-fix

import { useEffect, type ReactNode } from 'react'
import { cls } from '@/common/utils/cls'
import type { Actor } from '@/common/members/member'
import { Dot } from '@/common/members/Dot'
import type { TerminalOutcome } from '@/common/terminal/terminalMessage'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useFlash } from '@/common/board-marks/useFlash'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import { eventToOutcome } from '../lib/answer'
import styles from './Board.module.css'

type Props = {
  // The board words (5..20), shown as clickable tiles. Lowercase; displayed
  // uppercased via CSS. Three of them are the hidden secrets.
  words: string[]
  // Guessed words → was-it-a-secret. A guessed tile colors **permanently**
  // green (true) / red (false) and can't be re-picked. In compete RLS scopes
  // this to the viewer's own guesses; in coop it's the shared board. While
  // viewing history this is the snapshot's results (guesses up to that turn).
  results: ReadonlyMap<string, boolean>
  // The currently-picked word (highlighted), or null. Kept in sync with the
  // word entry by the parent.
  selected: string | null
  // Pick a word tile. Omitted when the board is non-interactive (terminal, the
  // viewer is out of guesses, or viewing history) — tiles render inert then.
  onPick?: (word: string) => void
  // Render read-only under the blue viewer frame (a past turn's
  // board). Off during live play.
  isViewingHistory?: boolean
  // The word the viewed turn's guess decided — ring its tile
  // history-blue (just OUTSIDE the tile, clear of its green/red fill). Null / omitted when live.
  historyLitWord?: string | null
  // WHO decided each tile — its guesser's identity dot, in the bottom-right
  // corner. Null outside coop: in compete you only ever see your own guesses, so
  // a dot would be decoration.
  //
  // A REVEALED secret is deliberately absent from this map (nobody guessed it),
  // which is what keeps found-vs-peeked readable without toggling the reveal off:
  // a green tile with a dot was found, a green tile without one was shown.
  decidedBy?: ReadonlyMap<string, Actor | undefined> | null
  // The word currently with the server — its tile takes the in-flight dim.
  inFlightWord?: string | null
  // The game is finished, and how it ended — the board takes a band in that
  // outcome's gray (neutral for a game merely ended). Null while it's live.
  gameOver?: TerminalOutcome | null
  // A teammate holds the move (turn-order coop): dim the whole board.
  notMyTurn?: boolean
  // True for a beat at the moment the turn becomes mine — flash the frame.
  myTurnJustStarted?: boolean
  // Guesses the server has recorded. The CAUSE the attention flash reads: a
  // board that changed while this stood still was revealed or re-dealt, not
  // played into.
  moveCount: number
  // A control floated over the board's top-right (the Shuffle button). Rendered
  // INSIDE the board root, which is the `position: relative` anchor — so it
  // hugs the VISUAL board rather than the column, whose top the board does not
  // reach.
  floatingControl?: ReactNode
}

/**
 * psychicnum's "board": a grid of clickable word tiles. The board FILLS the
 * available space (see Board.module.css + PlayArea.module.css + docs/ui.md
 * → the board grows to available space); the words lay out in a roughly-square
 * grid (`cols ≈ √N`), and both the column and row tracks are `1fr`, so the tiles
 * grow with the board.
 *
 * Clicking a tile sets the pending guess (mirrored by the word entry below the
 * board); once guessed, a word's tile colors **permanently** — green if it was
 * a secret, red if not — so the board doubles as an at-a-glance record of what's
 * been found and ruled out. In compete mode RLS scopes `results` to the caller,
 * so it reflects only the viewer's own attempts.
 *
 * At TERMINAL the board doubles as the answer key, and it does so through
 * `results` like everything else: the PlayArea folds the revealed secrets in as
 * hits, so they go green exactly as a found one does. Which is which is still
 * answerable — `decidedBy` names a guesser for a found tile and nobody for a
 * revealed one.
 */
export function Board({
  words,
  results,
  selected,
  onPick,
  isViewingHistory = false,
  historyLitWord = null,
  decidedBy = null,
  inFlightWord = null,
  gameOver = null,
  notMyTurn = false,
  myTurnJustStarted = false,
  moveCount,
  floatingControl,
}: Props) {
  // ATTENTION — the tiles that just got decided. psychicnum's coop board is
  // SHARED, so a teammate's guess colors a tile anywhere on it while you are
  // reading somewhere else: change in place, announcing nothing.
  //
  // Gated on the CAUSE (the event log) rather than on the board differing, because
  // the board also changes when nothing was played — asking to see the solution
  // turns every unfound secret green at once, and a restart clears the lot. Both
  // would light up the board at the moment nothing happened. See
  // `useMoveAttention`.
  const flashing = useMoveAttention({
    content: results,
    contentKey: [...results.keys()].sort().join(','),
    moveCount,
    // Quiet while reading a past turn: that board's guess is already ringed, and
    // a live guess landing behind the viewer is not something to point at.
    quiet: isViewingHistory,
    changed: (before, now) => new Set([...now.keys()].filter((w) => !before.has(w))),
  })

  // NO — the head-shake, on the words that just came back WRONG. It waits for
  // the flash to finish rather than riding it: the shake is a remark about the
  // tile's own color, and that color is under the yellow until the flash is done.
  const [shaking, shakeWrong] = useFlash<string>(VERDICT_SHAKE_MS)
  // Keyed on the WORDS rather than on the set that holds them: `results` is a
  // fresh Map every render, so an effect that depended on it would cancel its own
  // timer whenever anything re-rendered inside the wait.
  const wrongKey = [...flashing]
    .filter((w) => results.get(w) === false)
    .sort()
    .join(',')
  useEffect(function shakeAfterFlash() {
    if (wrongKey === '') return
    const timer = setTimeout(() => shakeWrong(wrongKey.split(',')), ATTENTION_FADE_MS)
    return () => clearTimeout(timer)
  }, [wrongKey, shakeWrong])

  const cols = Math.ceil(Math.sqrt(words.length))
  const rows = Math.ceil(words.length / cols)
  return (
    <div
      className={cls(shared.boardSeal, styles.board)}
      // data-board: a stable handle for e2e board-measurement (the height must not
      // change as the below-board slot swaps / the history banner overlays it) —
      // matching the other games' boards.
      data-board
      // The column/row counts drive the board's hug WIDTH + max-HEIGHT, both
      // computed in CSS from the --max-tile-* caps. See Board.module.css.
      style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}
    >
      {/* While viewing a past turn the shared history-blue `.historyFrame` rings the board AND
          makes it click-through (pointer-events: none) so a click anywhere returns
          to the live board (useHistoryViewer's document listener). */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          isViewingHistory && history.historyFrame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns: the viewer owns it while
          // open, being the state you chose and the one you can leave.
          gameOver !== null && !isViewingHistory && shared.gameOverFrame,
          gameOver === 'won' && !isViewingHistory && shared.gameOverWon,
          gameOver === 'lost' && !isViewingHistory && shared.gameOverLost,
        )}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {words.map((word) => {
          const guessed = results.has(word)
          const correct = results.get(word)
          // What a decided tile's permanent fill SAYS is the answer table's
          // ruling on the row (`lib/answer.ts`), the same one the pill and the
          // log read — so the board cannot color a miss differently from them.
          const decided = guessed
            ? eventToOutcome({ kind: 'guess', is_correct: correct === true, word })
            : null
          // `undefined` = draw no dot: either this game shows none (compete), or
          // nobody decided this tile (unguessed, or a revealed secret). A dot
          // whose member has left resolves to the neutral disc, not to nothing.
          const actor = decidedBy?.has(word) ? decidedBy.get(word) : undefined
          return (
            <button
              key={word}
              type="button"
              // A stable e2e hook: class names are hashed, and the floating
              // Shuffle control lives inside the board root, so "a button in the
              // board" would also match it.
              data-tile={word}
              className={cls(
                shared.tileFace,
                shared.tile,
                styles.tile,
                decided === 'won' && styles.decidedWon,
                decided === 'lost' && styles.decidedLost,
                selected === word && shared.selected,
                word === inFlightWord && shared.dimInFlight,
                flashing.has(word) && shared.attentionFlash,
                // NO — the head-shake, once the flash has handed the tile its
                // red back. The red is the half that survives reduced motion,
                // and a correct guess never shakes.
                shaking.has(word) && shared.verdictShake,
                // This tile is the guess the viewed turn decided.
                historyLitWord === word && styles.historyTile,
              )}
              disabled={guessed || !onPick}
              aria-pressed={selected === word || undefined}
              onClick={onPick ? () => onPick(word) : undefined}
              // NOT a focus target: `preventDefault` on mousedown so a CLICK
              // can't park focus here. Otherwise the next keystroke promotes
              // the clicked tile to `:focus-visible` and leaves a ring on it —
              // see connections' Board for the same note. A tile is clicked or
              // typed; it is never a keyboard target.
              onMouseDown={(e) => e.preventDefault()}
            >
              {/* --len drives the shared .tileWord auto-fit font heuristic. */}
              <span className={shared.tileWord} style={{ ['--len' as string]: word.length }}>
                {word}
              </span>
              {/* WHO decided this tile. The shared identity disc, so a player's
                  color means the same thing here as in the event log and the
                  opponent strip — and it brings its paired border shade with it,
                  which is what lets a light color read on a green fill. */}
              {actor !== undefined && (
                // `onColor`: a decided tile is always a saturated green or red, so
                // the ring goes white — the member's own darker shade vanishes into
                // a fill of the same hue (three reds in a row, in the worst case).
                <Dot color={actor?.color} onColor className={styles.actorDot} />
              )}
            </button>
          )
        })}
      </div>
      {floatingControl}
    </div>
  )
}
