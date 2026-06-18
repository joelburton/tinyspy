import styles from './Stats.module.css'

type Props = {
  score: number
  totalScore: number
  wordsFound: number
  totalWords: number
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
 * (PlayArea) wires in the values from `status.score` /
 * `status.words_found` / `ctx.timer`.
 */
export function Stats({
  score,
  totalScore,
  wordsFound,
  totalWords,
  timerDisplay,
}: Props) {
  return (
    <div className={styles.stats}>
      <div className={styles.cell}>
        <span className={styles.label}>Score</span>
        <span className={styles.value}>
          {score}
          <span className={styles.muted}> / {totalScore}</span>
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>Words</span>
        <span className={styles.value}>
          {wordsFound}
          <span className={styles.muted}> / {totalWords}</span>
        </span>
      </div>
      <div className={styles.cell}>
        <span className={styles.label}>Time</span>
        <span className={styles.value}>{timerDisplay}</span>
      </div>
    </div>
  )
}
