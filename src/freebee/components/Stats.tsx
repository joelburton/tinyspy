import styles from './Stats.module.css'

type Props = {
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number
  /** Display string for the timer cell, e.g. "9:34" or "—". */
  timerDisplay: string
}

/**
 * The 3-cell stat grid below the rank bar: Score, Words, Time.
 *
 * Each cell is `label / value`. Values are tabular-nums so the
 * digits don't shift width as the score climbs. The timer cell
 * shows whatever the parent passes — typically `formatTimerSeconds`
 * of `ctx.timer.displaySeconds`, or `'—'` when timer mode is
 * `none`.
 *
 * Pure presentation — no derivation, no state. The parent
 * (PlayArea) wires in the found vs required figures (found counts
 * include bonus words, so each numerator can overshoot its
 * required denominator).
 */
export function Stats({
  foundWordsScore,
  requiredWordsScore,
  foundWordsCount,
  requiredWordsCount,
  timerDisplay,
}: Props) {
  return (
    <div className={styles.stats}>
      <div className={styles.cell}>
        <span className={styles.label}>Score</span>
        <span className={styles.value}>
          {foundWordsScore}
          <span className={styles.muted}> / {requiredWordsScore}</span>
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>Words</span>
        <span className={styles.value}>
          {foundWordsCount}
          <span className={styles.muted}> / {requiredWordsCount}</span>
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>Time</span>
        <span className={styles.value}>{timerDisplay}</span>
      </div>
    </div>
  )
}
