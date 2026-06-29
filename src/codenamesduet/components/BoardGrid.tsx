import { cls } from '../../common/lib/cls'
import type { WordRow } from '../hooks/useBoard'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import shared from '../../common/components/PlayArea.module.css'
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
  /** The tile whose guess RPC is in flight (the pending "…" + accent ring), or
   *  null. Owned by PlayArea, which dispatches the guess. */
  pendingPos: number | null
  /** Fire a guess on the given board position. PlayArea owns the submit_guess
   *  RPC + the own-action error flash; this component just reports the click. */
  onGuess: (position: number) => void
}

/**
 * The 5×5 codenamesduet board — presentational. It owns only the per-tile render
 * logic (the result fill, the keycard/triangle/pending overlays, the click
 * gate); the guess DISPATCH (the submit_guess RPC, the pending-tile state, the
 * own-action error flash) lives in PlayArea, so the flash can sit in the
 * below-board slot next to the clue UI and match psychicnum/connections (the
 * host owns the move + its local feedback). A click calls `onGuess`; the reveal
 * arrives via Realtime → `useBoard` refetches → the tile re-renders with its
 * result color.
 *
 * It's its own component for **read-locality**: the per-tile tint/overlay/click
 * logic is busy enough that inlining it would clutter PlayArea, which stays
 * readable as "board → clue slot → info column."
 */
export function BoardGrid({
  words,
  myKey,
  peerKey,
  mySeat,
  gameOver,
  cellsClickable,
  pendingPos,
  onGuess,
}: Props) {
  // .board wrapper + .grid mirror psychicnum/connections (the shared "board"
  // shape — the single place a future framed board would live); the tiles
  // themselves are the shared `.tile`/`.tileWord` chrome, with the
  // keycard/triangle/pending OVERLAYS layered on via `.overlayTile` (which makes
  // the tile a positioning context for them).
  return (
    // data-board: a stable handle for the e2e layout-stability test, which
    // measures this element's height across below-board states (it must not
    // change as the clue UI swaps). See e2e/codenamesduet.e2e.ts.
    <div className={styles.board} data-board>
      <div className={styles.grid}>
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
                shared.tile,
                styles.overlayTile,
                bgCls,
                isPending && styles.tilePending,
              )}
              disabled={!clickable || isPending}
              onClick={() => clickable && onGuess(w.position)}
            >
              {/* Peer's keycard — top-right, only once the game's over (their
                  view is secret during play). */}
              {gameOver && peerLabel !== null && (
                <span
                  className={cls(styles.keySquare, styles.keyPeer, styles[KEY_SQUARE[peerLabel]])}
                  aria-hidden
                />
              )}
              {/* "Peer guessed this neutral" — triangle above the word,
                  pointing up toward where they sit. Dropped once the cell is
                  contacted (agent/assassin) — markers are only for live
                  neutrals. */}
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
    </div>
  )
}
