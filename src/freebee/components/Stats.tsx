import styles from './Stats.module.css'

type Props = {
  foundWordsScore: number
  requiredWordsScore: number
  foundWordsCount: number
  requiredWordsCount: number
}

/**
 * The 2-cell stat grid below the rank bar: Score, Words.
 *
 * Each cell is `label / value`. Values are tabular-nums so the
 * digits don't shift width as the score climbs. (No timer cell —
 * the GamePage header already shows the countdown, so repeating it
 * here would be redundant.)
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
    </div>
  )
}
