import { useState } from 'react'
import { cls } from '../../common/lib/cls'
import { db } from '../db'
import styles from './GameOverBanner.module.css'

const STATUS_BANNER: Record<string, { text: string; tone: 'win' | 'loss' }> = {
  won: { text: 'Victory! All 15 agents found.', tone: 'win' },
  lost_assassin: { text: 'Game over — an assassin was revealed.', tone: 'loss' },
  lost_clock: { text: 'Game over — ran out of time in sudden death.', tone: 'loss' },
}

type Props = {
  /** Current game's status — anything in `STATUS_BANNER`. */
  status: string
  /** UUID of the just-finished game, passed to `play_again`. */
  gameId: string
  /** Set on `games.next_game_id` once a successor exists. */
  nextGameId: string | null
  /** Opponent display name, used in the button label. */
  opponentName?: string
  /** Cancel: go back to the home screen (clears the URL hash). */
  onLeave: () => void
  /** Successfully started a new game — App enters it and updates the URL. */
  onEnterGame: (id: string) => void
}

/**
 * Banner shown when a game enters a terminal state (won / lost_*).
 *
 * Offers two actions:
 *   - **Play again**: calls the `play_again` RPC. The first caller
 *     creates the successor (in the same club, with fresh words +
 *     key card, both players pre-seated, status='active' directly);
 *     a later caller from the same finished game gets the same id
 *     back (idempotent), so both players end up on the same new
 *     board regardless of who clicks first.
 *   - **Back to home**: leaves the current game, returning to /.
 *
 * The label flips to "Join {opponent}'s new game" once the partner
 * has already clicked Play again — `nextGameId` becomes non-null
 * via Realtime propagation from the prev game's
 * `games.next_game_id` column.
 */
export function GameOverBanner({
  status,
  gameId,
  nextGameId,
  opponentName,
  onLeave,
  onEnterGame,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const banner = STATUS_BANNER[status]
  if (!banner) return null

  async function playAgain() {
    setError(null)
    setBusy(true)
    const { data, error } = await db
      .rpc('play_again', { prev_game: gameId })
      .single()
    setBusy(false)
    if (error || !data) {
      setError(error?.message ?? 'failed to start a new game')
      return
    }
    onEnterGame(data.id)
  }

  const playAgainLabel = nextGameId
    ? `Join ${opponentName ?? 'partner'}'s new game`
    : opponentName
      ? `Play again with ${opponentName}`
      : 'Play again'

  return (
    <div className={cls(styles.gameOver, styles[banner.tone])}>
      <strong>{banner.text}</strong>
      <div className={styles.gameOverActions}>
        <button type="button" onClick={playAgain} disabled={busy}>
          {busy ? '…' : playAgainLabel}
        </button>
        <button type="button" className="secondary" onClick={onLeave}>
          Back to home
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
