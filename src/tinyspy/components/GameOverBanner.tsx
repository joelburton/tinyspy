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
}

/**
 * Banner shown when a game enters a terminal state (won / lost_*).
 *
 * Purely informational — no action button. The common `<GamePage>`
 * header already renders Back-to-club; duplicating it here would
 * just be visual clutter. The banner exists to give game-end
 * outcomes a prominent, celebratory (or commiseratory) frame.
 */
export function GameOverBanner({ status }: Props) {
  const banner = STATUS_BANNER[status]
  if (!banner) return null

  return (
    <div className={cls(styles.gameOver, styles[banner.tone])}>
      <strong>{banner.text}</strong>
    </div>
  )
}
