import { useState } from 'react'
import { cls } from '../../common/lib/cls'
import { db } from '../db'
import type { WordRow } from '../hooks/useBoard'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import styles from './BoardGrid.module.css'

/**
 * KeyLabel ('G'|'N'|'A') → the keycard-square color class. The squares always
 * use the *unrevealed* (soft) palette — they show what a key card SAYS about a
 * cell, independent of what's been guessed. Style rules live in
 * BoardGrid.module.css; this map is the one place translating the data alphabet
 * to presentation classes.
 */
const KEY_SQUARE: Record<KeyLabel, 'keyAgent' | 'keyNeutral' | 'keyAssassin'> = {
  G: 'keyAgent',
  N: 'keyNeutral',
  A: 'keyAssassin',
}

type Props = {
  gameId: string
  /** The 25 board word rows, with denormalized reveal state. */
  words: WordRow[]
  /** The caller's own key view (a 25-element array of G/N/A). */
  myKey: KeyLabel[]
  /** The partner's key view. Null while the game is in play; populated
   *  post-game so the peer's keycard square can be shown. */
  peerKey: KeyLabel[] | null
  /** Caller's seat ('A' | 'B') or undefined if not seated. Picks which
   *  per-seat neutral flag is "mine" for the background + click gate. */
  mySeat: Seat | undefined
  /** Whether the game has reached a terminal status. Gates the peer keycard
   *  square (shown only once the game is over). */
  gameOver: boolean
  /** Whether the caller should be able to click cells right now.
   *  Computed by derivePhase against game.status + seat + clue
   *  state. */
  cellsClickable: boolean
}

/**
 * The 5×5 tinyspy board. Owns its own per-tile render logic and
 * the submit_guess RPC dispatch — the inputs are the board state +
 * the "is clicking allowed" flag from derivePhase, the outputs are
 * realtime row updates that the parent's `useBoard` refetches into
 * a re-render here.
 *
 * Why this is its own component:
 *
 *   - **Read-locality.** When you're scanning PlayArea to follow
 *     the page composition, the per-tile tint/stripe/click logic
 *     is busy enough that it doesn't help to inline it. Moving it
 *     here keeps PlayArea readable as "header → game-over banner →
 *     clue panel → board → game log."
 *   - **State-locality.** `pendingPos` (which tile is mid-RPC) and
 *     `guessError` (the most recent RPC error) are only meaningful
 *     to the board. Same for `handleGuess` itself. Moving all
 *     three down means PlayArea doesn't see RPC-dispatch
 *     machinery at all.
 *
 * The error banner is rendered above the grid (inside this
 * component) so its dismiss interaction co-locates with the
 * surface that produced it.
 */
export function BoardGrid({
  gameId,
  words,
  myKey,
  peerKey,
  mySeat,
  gameOver,
  cellsClickable,
}: Props) {
  const [pendingPos, setPendingPos] = useState<number | null>(null)
  const [guessError, setGuessError] = useState<string | null>(null)

  async function handleGuess(position: number) {
    setGuessError(null)
    setPendingPos(position)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      target_position: position,
    })
    setPendingPos(null)
    if (error) {
      console.error('submit_guess failed', error)
      setGuessError(error.message)
    }
    // Successful guess: the reveal arrives via Realtime → useBoard
    // refetches → the tile re-renders with its solid color. No
    // optimistic update.
  }

  return (
    <>
      {guessError && (
        <div className={styles.errorBanner}>
          {guessError}{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => setGuessError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      <div className={styles.boardGrid}>
        {words.map((w) => {
          const myLabel = myKey[w.position]
          const peerLabel = peerKey?.[w.position] ?? null

          // Per-seat bystander marks. A neutral I made locks the cell for ME;
          // one my partner made does NOT — the word may be my agent in the
          // other direction (the Duet rule). Both are PUBLIC events (a neutral
          // guess is visible on the shared board), so both triangles show
          // during play; only the peer's KEY (the square) stays secret.
          const iNeutraled =
            mySeat === 'A' ? w.neutral_a : mySeat === 'B' ? w.neutral_b : false
          const partnerNeutraled =
            mySeat === 'A' ? w.neutral_b : mySeat === 'B' ? w.neutral_a : false
          const revealed = w.revealed_as !== null

          // The tile BACKGROUND is what HAPPENED on this cell:
          //   green  — we contacted an agent (global)
          //   red    — the assassin was hit (global)
          //   tan    — SOMEONE guessed it as a neutral (which player → triangles)
          //   white  — no one has guessed it
          const bgCls =
            w.revealed_as === 'G' ? styles.bgAgent
            : w.revealed_as === 'A' ? styles.bgAssassin
            : (w.neutral_a || w.neutral_b) ? styles.bgNeutral
            : styles.bgWhite

          // Clickable unless globally revealed or *I* already neutraled it. A
          // partner-only neutral stays clickable (it may be my agent).
          const clickable = cellsClickable && !revealed && !iNeutraled
          const isPending = pendingPos === w.position

          return (
            <button
              key={w.position}
              type="button"
              className={cls(
                styles.tile,
                bgCls,
                clickable && styles.tileClickable,
                isPending && styles.tilePending,
              )}
              disabled={!clickable || isPending}
              onClick={() => clickable && handleGuess(w.position)}
            >
              {/* Peer's keycard — top-right, only once the game's over (their
                  view is secret during play). */}
              {gameOver && peerLabel !== null && (
                <span
                  className={cls(styles.keySquare, styles.keyPeer, styles[KEY_SQUARE[peerLabel]])}
                  aria-hidden
                />
              )}
              {/* "Peer guessed this neutral" — triangle above the word, pointing
                  up toward where they sit. Dropped once the cell is contacted
                  (agent/assassin) — the markers are only for live neutrals. */}
              {partnerNeutraled && !revealed && (
                <span className={cls(styles.triangle, styles.triPeer)} aria-hidden />
              )}
              <span className={styles.tileWord}>{w.word}</span>
              {/* "I guessed this neutral" — triangle below the word, pointing
                  down toward me. */}
              {iNeutraled && !revealed && (
                <span className={cls(styles.triangle, styles.triMine)} aria-hidden />
              )}
              {/* My keycard — bottom-left. Hidden while I'm actively guessing
                  the peer's clue (cellsClickable): my own key is irrelevant to
                  a guess, and its absence is a big visual "you're still
                  guessing — press Done when you're through" reminder. Shown the
                  rest of the time (clue-giving, waiting, game over). */}
              {!cellsClickable && (
                <span
                  className={cls(styles.keySquare, styles.keyMine, styles[KEY_SQUARE[myLabel]])}
                  aria-hidden
                />
              )}
              {isPending && <span className={styles.tileKey}>…</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
