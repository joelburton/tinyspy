import type { Seat } from '../lib/phase'
import type { Player } from '../hooks/useGame'
import styles from './PlayArea.module.css'

type Props = {
  /** Caller's seat or undefined if they're not seated. */
  mySeat: Seat | undefined
  /** The other seated player. Used for the "with <name>" header
   *  line. May be undefined briefly during the initial roster
   *  fetch, in which case the line collapses to a placeholder. */
  opponent: Player | undefined
  /** Whose turn it is to give a clue. Null when no clue-giver is
   *  set (terminal status, or during sudden death). */
  currentClueGiver: string | null
  /** Number of green agents revealed so far. The win condition is
   *  greenFound === 15. */
  greenFound: number
  /** Timer tokens remaining (Duet's per-turn clock). Decrements
   *  on neutral / pass. Hits 0 → sudden_death. */
  turnsRemaining: number
  /** Whether the game is in sudden_death. Swaps the "tokens
   *  left" copy for "sudden death." */
  inSuddenDeath: boolean
  /** Whether the game has reached a terminal status. Hides the
   *  clue-giver indicator (no more clues are given post-game). */
  gameOver: boolean
}

/**
 * The in-game header strip above the board — seat label, opponent
 * name, current clue-giver (when applicable), greens-found count,
 * tokens-remaining indicator. Pure rendering over a snapshot of
 * game state.
 *
 * "How to play" used to live here as a link-button; it moved to
 * the GamePage menu (the common "Help" item, backed by tinyspy's
 * `Help.tsx`). See docs/ui.md → "GamePage menu."
 *
 * Why this extraction lands cleanly even though it has no async
 * work and no RPC dispatch: read-locality. When you're scanning
 * PlayArea to follow the page composition, the "what does the
 * header show" question doesn't need to occupy a screenful. The
 * extraction also gives us a named seam to evolve the at-a-glance
 * status display (per-turn timer, agent-found progress bar, etc.)
 * without touching PlayArea.
 */
export function GameHeader({
  mySeat,
  opponent,
  currentClueGiver,
  greenFound,
  turnsRemaining,
  inSuddenDeath,
  gameOver,
}: Props) {
  return (
    <header className={styles.boardHeader}>
      <div>
        <div>
          <strong>{mySeat}</strong> · with{' '}
          <strong>{opponent?.username ?? '…'}</strong>
        </div>
        {!gameOver && !inSuddenDeath && (
          <div className="muted">
            clue-giver: <strong>{currentClueGiver}</strong>
          </div>
        )}
      </div>
      <div className={styles.status}>
        <div>
          <strong>{greenFound}</strong> / 15 agents
        </div>
        <div className="muted">
          {inSuddenDeath
            ? 'sudden death'
            : `${turnsRemaining} tokens left`}
        </div>
      </div>
    </header>
  )
}
