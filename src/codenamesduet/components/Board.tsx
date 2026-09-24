// cs-blessed-codenamesduet

import { useEffect } from 'react'
import { cls } from '@/common/utils/cls'
import { useMoveAttention } from '@/common/board-marks/useMoveAttention'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { WordRow } from '../hooks/useBoard'
import type { KeyLabel } from '../lib/labels'
import { isGuessable, type Seat } from '../lib/phase'
import { positionAt } from '../lib/boardShape'
import type { Cell } from '@/common/board-cursor/stepCell'
import shared from '@/common/game-page/playArea.module.css'
import history from '@/common/event-log/historyViewer.module.css'
import styles from './Board.module.css'

/** Empty lit-tile set — a stable reference so a live render never rings a tile. */
const NO_TILES: ReadonlySet<number> = new Set()

/** What a tile's reveal state is, as one comparable string per position. */
const revealKey = (w: WordRow) => `${w.revealed_as ?? '-'}${w.neutral_a ? 'a' : ''}${w.neutral_b ? 'b' : ''}`

/**
 * KeyLabel ('G'|'N'|'A') → the keycard-square color class. The squares always
 * use the *unrevealed* (soft) palette — they show what a key card SAYS about a
 * cell, independent of what's been guessed. Style rules live in
 * Board.module.css; this map is the one place translating the data alphabet
 * to presentation classes.
 */
const KEY_SQUARE: Record<KeyLabel, 'keyAgent' | 'keyNeutral' | 'keyAssassin'> = {
  G: 'keyAgent',
  N: 'keyNeutral',
  A: 'keyAssassin',
}

type Props = {
  // The 25 board word rows, with denormalized reveal state.
  words: WordRow[]
  // The caller's own key view (a 25-element array of G/N/A).
  myKey: KeyLabel[]
  // The partner's key view — null until the caller chooses to see it, which
  // the reveal allows only once the game is over.
  peerKey: KeyLabel[] | null
  // The caller's seat. Picks which per-seat neutral flag is "mine" for the
  // triangles and the click gate.
  mySeat: Seat
  // Gates the peer's key-card square, shown only once the game is over.
  gameOver: boolean
  // Whether the caller may click tiles right now — the phase's answer
  // (`derivePhase`), with the viewer ORed in by BoardCol.
  cellsClickable: boolean
  // The tile whose guess is in flight — dimmed until the reply — or null.
  // BoardCol's, which dispatches the guess.
  pendingPos: number | null
  // A click on a clickable tile. BoardCol owns `submit_guess`; this component
  // only reports the position.
  onGuess: (position: number) => void
  // The keyboard's selection cursor — the cell to ring — or null when it is
  // not drawn (see `useBoardSelectionCursor`).
  cursor: Cell | null
  // The word the keyboard has picked, waiting for Enter — its position, drawn
  // with the selected border — or null.
  picked: number | null
  // A past turn's board is open: `words` is then its snapshot, the frame rings
  // the board, and clicks fall through to the viewer's own exit.
  isViewingHistory?: boolean
  // The board positions the viewed turn decided — ringed in the history blue
  // ("added this turn"). Empty / omitted when live.
  historyLitTiles?: ReadonlySet<number>
  // My partner holds the move: the board dims.
  notMyTurn: boolean
  // True for a beat as the move becomes mine: the board's frame flashes.
  myTurnJustStarted: boolean
  // Guesses the server has recorded — the CAUSE the attention flash reads. A
  // restart deletes them, so it drops rather than advances.
  moveCount: number
  // The ending's outcome, for the game-over frame's color; null while playing.
  terminalOutcome: Outcome | null
}

/**
 * The 5×5 codenamesduet board — presentational. It owns the per-tile render
 * alone: the result fill, the key-card and triangle overlays, the click gate,
 * and the shared board marks (plans/tile-feedback.md) — the keyboard's pick and
 * cursor ring, the in-flight dim, the attention flash and the shake on a tile,
 * the turn dim and flash and the
 * game-over frame on the board. A click calls `onGuess`; BoardCol dispatches
 * the guess, and the reveal arrives by Realtime — `useBoard` refetches and the
 * tile re-renders in its result color.
 */
export function Board({
  words,
  myKey,
  peerKey,
  mySeat,
  gameOver,
  cellsClickable,
  pendingPos,
  onGuess,
  cursor,
  picked,
  isViewingHistory = false,
  historyLitTiles = NO_TILES,
  notMyTurn,
  myTurnJustStarted,
  moveCount,
  terminalOutcome,
}: Props) {
  // ATTENTION — the tiles a guess just turned over, mine included: the answer
  // arrives in the tile I am watching, and a partner's lands anywhere. Gated on
  // the guess log, not on the board differing, so a restart, the history
  // viewer and the partner's key being shown never flash. See
  // `useMoveAttention`.
  const flashing = useMoveAttention({
    content: words,
    contentKey: words.map(revealKey).join(','),
    moveCount,
    quiet: isViewingHistory,
    changed: (before, now) =>
      new Set(now.filter((w, i) => revealKey(w) !== revealKey(before[i] ?? w)).map((w) => w.position)),
  })

  // NO — the head-shake on a tile that came back a bystander or the assassin,
  // once the flash has handed the tile its color back. An agent never shakes.
  const [shakeMark, shakeWrong] = useMark<{ positions: ReadonlySet<number> }>(VERDICT_SHAKE_MS)
  const shaking = shakeMark?.value.positions ?? NO_TILES
  // Keyed on the positions rather than the set: `words` is a fresh array every
  // refetch, and an effect depending on it would cancel its own timer.
  const wrongKey = [...flashing]
    .filter((p) => words[p] && words[p].revealed_as !== 'G')
    .sort((a, b) => a - b)
    .join(',')
  useEffect(function shakeAfterFlash() {
    if (wrongKey === '') return
    const timer = setTimeout(
      () => shakeWrong({ positions: new Set(wrongKey.split(',').map(Number)) }),
      ATTENTION_FADE_MS,
    )
    return () => clearTimeout(timer)
  }, [wrongKey, shakeWrong])

  // The tiles are the shared `.tile` / `.tileWord` chrome; the key-card and
  // triangle overlays are layered on through `.overlayTile`, which
  // makes the tile their positioning context.
  return (
    // data-board: the e2e handle for the layout-stability test, which measures
    // this element's height across the below-board states.
    <div className={cls(shared.boardSeal, styles.board)} data-board>
      {/* While a past turn is open the shared `.historyFrame` rings the board and
          makes it click-through (pointer-events: none), so a click on it reaches
          the viewer's own document-level exit. */}
      <div
        className={cls(
          shared.hugRectWidth,
          styles.grid,
          isViewingHistory && history.historyFrame,
          notMyTurn && shared.dimNotYourTurn,
          myTurnJustStarted && shared.yourTurnFlash,
          // Both frames are outlines, so they take turns: the viewer owns it
          // while open, being the state you chose and the one you can leave.
          terminalOutcome !== null && !isViewingHistory && shared.gameOverFrame,
          terminalOutcome === 'won' && !isViewingHistory && shared.gameOverWon,
          terminalOutcome === 'lost' && !isViewingHistory && shared.gameOverLost,
        )}
      >
        {words.map((w) => {
          const myLabel = myKey[w.position]
          const peerLabel = peerKey?.[w.position] ?? null

          // Per-seat bystander marks. A neutral I made locks the tile for ME;
          // one my partner made does not — the word may be my agent in the
          // other direction (the Duet rule). Both are public, so both
          // triangles show during play; only the peer's KEY (the square) is
          // withheld.
          const iNeutraled = mySeat === 'A' ? w.neutral_a : w.neutral_b
          const partnerNeutraled = mySeat === 'A' ? w.neutral_b : w.neutral_a
          const revealed = w.revealed_as !== null

          // The tile background is what HAPPENED on this tile:
          //   green  — an agent was contacted (by either seat)
          //   red    — the assassin was hit
          //   tan    — someone guessed it as a neutral (who → the triangles)
          //   white  — nobody has guessed it
          const bgCls =
            w.revealed_as === 'G' ? styles.bgAgent
            : w.revealed_as === 'A' ? styles.bgAssassin
            : (w.neutral_a || w.neutral_b) ? styles.bgNeutral
            : styles.bgWhite

          // Clickable unless revealed, or *I* already neutraled it — the rule
          // is `isGuessable`'s, which the keyboard's Space asks too. (A past
          // turn open is already in `cellsClickable`.)
          const clickable = cellsClickable && isGuessable(w, mySeat)
          const isPending = pendingPos === w.position

          return (
            <button
              key={w.position}
              type="button"
              className={cls(
                shared.tileFace,
                shared.tile,
                styles.overlayTile,
                bgCls,
                // The keyboard's pick, waiting for Enter, and its cursor.
                picked === w.position && shared.selected,
                cursor !== null && positionAt(cursor.x, cursor.y) === w.position && shared.selectionCursor,
                isPending && shared.dimInFlight,
                flashing.has(w.position) && shared.attentionFlash,
                shaking.has(w.position) && shared.verdictShake,
                // Turn-history: this cell was decided on the turn being viewed.
                historyLitTiles.has(w.position) && styles.historyTile,
              )}
              disabled={!clickable || isPending}
              onClick={() => clickable && onGuess(w.position)}
            >
              {/* The peer's key-card square — top-right, once the game is over
                  and the caller has asked to see it. */}
              {gameOver && peerLabel !== null && (
                <span
                  className={cls(styles.keySquare, styles.keyPeer, styles[KEY_SQUARE[peerLabel]])}
                  aria-hidden
                />
              )}
              {/* "My partner guessed this neutral" — a triangle above the word,
                  pointing up toward them. Both triangles go once the tile is
                  revealed: a mark is for a live neutral only. */}
              {partnerNeutraled && !revealed && (
                <span className={cls(styles.triangle, styles.triPeer)} aria-hidden />
              )}
              {/* --len drives the shared .tileWord auto-fit font heuristic. */}
              <span
                className={shared.tileWord}
                style={{ ['--len' as string]: w.word.length }}
              >
                {w.word}
              </span>
              {/* "I guessed this neutral" — a triangle below the word, pointing
                  down toward me. */}
              {iNeutraled && !revealed && (
                <span className={cls(styles.triangle, styles.triMine)} aria-hidden />
              )}
              {/* My key-card square — bottom-left. Hidden while I am the one
                  guessing (my own key says nothing about my partner's clue);
                  shown the rest of the time — cluing, waiting, game over. */}
              {!cellsClickable && (
                <span
                  className={cls(styles.keySquare, styles.keyMine, styles[KEY_SQUARE[myLabel]])}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
