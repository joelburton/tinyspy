import { useState } from 'react'
import { cls } from '../../common/lib/cls'
import { db } from '../db'
import type { WordRow } from '../hooks/useBoard'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'
import styles from './BoardGrid.module.css'

/**
 * Per-label module-class lookup. Local to BoardGrid since it's the
 * only consumer; the actual style rules live in
 * PlayArea.module.css under `.tileAgent`, `.tileNeutral`,
 * `.tileAssassin`. Indirection lets the rest of the file say
 * `styles[TILE_BG[label]]` and have everything stay scoped.
 *
 * The data-side KeyLabel ('G'|'N'|'A') keeps its single-letter
 * shape — those letters are persisted in tinyspy.words.revealed_as
 * and in the seat key cards. The mapping below is the one place
 * that translates from the data alphabet to the presentation-
 * layer's semantic class names.
 */
const TILE_BG: Record<KeyLabel, 'tileAgent' | 'tileNeutral' | 'tileAssassin'> = {
  G: 'tileAgent',
  N: 'tileNeutral',
  A: 'tileAssassin',
}

type Props = {
  gameId: string
  /** The 25 board word rows, including any reveal state. */
  words: WordRow[]
  /** The caller's own key view (a 25-element array of G/N/A). */
  myKey: KeyLabel[]
  /** The partner's key view. Null while the game is in play;
   *  populated post-game so we can render the dual-stripe review. */
  peerKey: KeyLabel[] | null
  /** Caller's seat ('A' | 'B') or undefined if they're not seated.
   *  Drives which key view appears on top vs bottom in the
   *  post-game stripes. */
  mySeat: Seat | undefined
  /** Whether the game has reached a terminal status. Switches the
   *  per-cell render between "in-play hint" and "post-game dual
   *  stripe." */
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
          // GLOBAL reveal — agent contacted ('G') or assassin ('A'), solid for
          // everyone. Neutrals are not global (see below).
          const revealed = w.revealed_as !== null

          // Per-seat bystander marks. A neutral I made locks the cell for ME;
          // one my partner made does NOT — the word may be my agent in the
          // other direction (the Duet rule). When both marked it, it's dead.
          const iNeutraled =
            mySeat === 'A' ? w.neutral_a : mySeat === 'B' ? w.neutral_b : false
          const partnerNeutraled =
            mySeat === 'A' ? w.neutral_b : mySeat === 'B' ? w.neutral_a : false

          // Two split-tile renderings:
          //  - in-play neutral: my keycard color on top, the "was guessed as a
          //    bystander" neutral color on the bottom (shown to BOTH the
          //    guesser and the partner; only the partner can still click it).
          //  - post-game review: A's key on top, B's on bottom, for every
          //    still-unrevealed cell.
          const neutralSplit =
            !revealed && !gameOver && (iNeutraled || partnerNeutraled)
          const showPostGameReveal = gameOver && !revealed && peerLabel !== null

          // For the post-game stripes, A's label goes on top and B's on bottom
          // regardless of who's looking.
          const aLabel: KeyLabel =
            mySeat === 'A' ? myLabel : peerLabel ?? myLabel
          const bLabel: KeyLabel =
            mySeat === 'B' ? myLabel : peerLabel ?? myLabel

          let topStripe: KeyLabel | 'neutral' | null = null
          let bottomStripe: KeyLabel | 'neutral' | null = null
          if (neutralSplit) {
            topStripe = myLabel // my keycard color
            bottomStripe = 'neutral' // the bystander-was-guessed color
          } else if (showPostGameReveal) {
            topStripe = aLabel
            bottomStripe = bLabel
          }
          const stripeCls = (s: KeyLabel | 'neutral') =>
            s === 'neutral' ? styles.tileNeutral : styles[TILE_BG[s]]

          const tintCls = revealed
            ? cls(styles.tileRevealed, styles[TILE_BG[w.revealed_as as KeyLabel]])
            : topStripe !== null
              ? styles.tilePostgame
              : cls(styles.tileHint, styles[TILE_BG[myLabel]])

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
                tintCls,
                clickable && styles.tileClickable,
                isPending && styles.tilePending,
              )}
              disabled={!clickable || isPending}
              onClick={() => clickable && handleGuess(w.position)}
            >
              {topStripe !== null && (
                <div className={cls(styles.tileStripe, stripeCls(topStripe))} aria-hidden />
              )}
              <span className={styles.tileWord}>{w.word}</span>
              {bottomStripe !== null && (
                <div className={cls(styles.tileStripe, stripeCls(bottomStripe))} aria-hidden />
              )}
              {isPending && <span className={styles.tileKey}>…</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}
