import { cls } from '../../common/lib/util/cls'
import styles from './HintBar.module.css'

type Props = {
  /** Points on the bar (0..cost). */
  points: number
  /** Valid words per hint — the bar's denominator. */
  cost: number
  /** A hint is already on the board. */
  showing: boolean
  disabled?: boolean
  onSpend: () => void
}

/**
 * The hint economy, below the board: a bar that fills as valid non-theme words
 * are found, and the button that cashes it.
 *
 * **Below the board, not in the info column** — and that is a real placement
 * decision rather than a default. On a phone the info column moves off-canvas
 * into the InfoSheet, and the hint bar is core play, not a readout you check
 * occasionally: a player who can't see how close the next hint is has lost the
 * loop the game runs on.
 *
 * **The full bar is the only signal that further points are being lost.** Per
 * Joel's ruling the counter caps at `cost`, so words found while a hint sits
 * unspent earn nothing — and nothing warns about it, deliberately. That makes
 * the filled state load-bearing, which is why it gets its own styling rather
 * than just being "100% wide".
 */
export function HintBar({ points, cost, showing, disabled, onSpend }: Props) {
  const full = points >= cost
  const pct = Math.min(100, Math.round((points / Math.max(1, cost)) * 100))

  return (
    <div className={styles.row}>
      <div
        className={styles.track}
        role="meter"
        aria-valuenow={points}
        aria-valuemin={0}
        aria-valuemax={cost}
        aria-label="Progress to the next hint"
      >
        <div
          className={cls(styles.fill, full && styles.fillFull)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        type="button"
        className={styles.button}
        onClick={onSpend}
        // A hint already on the board blocks a second one: the board can only
        // ring one word legibly, and the server refuses anyway.
        disabled={disabled || !full || showing}
        title={
          showing
            ? 'A hint is already showing'
            : full
              ? 'Reveal the tiles of one theme word'
              : `Find ${cost - points} more valid word${cost - points === 1 ? '' : 's'}`
        }
      >
        Hint
      </button>
    </div>
  )
}
