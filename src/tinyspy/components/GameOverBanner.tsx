import { cls } from '../../common/lib/cls'
import styles from './GameOverBanner.module.css'

const STATUS_BANNER: Record<string, { text: string; tone: 'win' | 'loss' }> = {
  won: { text: 'Victory! All 15 agents found.', tone: 'win' },
  lost_assassin: { text: 'Game over — an assassin was revealed.', tone: 'loss' },
  lost_clock: { text: 'Game over — ran out of time in sudden death.', tone: 'loss' },
}

type Props = {
  /** Current game's status — anything in `STATUS_BANNER`. */
  status: string
  /** Cancel: go back to the home screen. */
  onLeave: () => void
}

/**
 * Banner shown when a game enters a terminal state (won / lost_*).
 *
 * Single action: "Back to home", from which the user can navigate
 * back into the club to start a new game. There's no in-banner
 * "play again" shortcut — the club page is the one and only place
 * games are started, so every new game flows through the setup
 * dialog (which owns the turn-count and first-clue-giver choices).
 *
 * Keeping creation gated through the club page also means we never
 * have a second copy of the create-game logic to keep in sync with
 * any future changes to setup options.
 */
export function GameOverBanner({ status, onLeave }: Props) {
  const banner = STATUS_BANNER[status]
  if (!banner) return null

  return (
    <div className={cls(styles.gameOver, styles[banner.tone])}>
      <strong>{banner.text}</strong>
      <div className={styles.gameOverActions}>
        <button type="button" onClick={onLeave}>
          Back to home
        </button>
      </div>
    </div>
  )
}
