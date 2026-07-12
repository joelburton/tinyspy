import { lengthScore } from '../lib/scoring'
import styles from './LengthScoreBar.module.css'

/**
 * The length-score readout — a horizontal bar filled to
 * `round(100 * longest / maxLen)` (the FE port `lengthScore`, matching the
 * server's `_length_score`). Shown ONLY at terminal: mid-game the info
 * column shows a plain "guesses n/5" instead, because the score is a
 * terminal-only reveal (the "length only during play" rule).
 *
 * The label reads "best N / possible M" so the percentage has a concrete
 * anchor (your longest guess vs the longest possible word).
 */
export function LengthScoreBar({ longest, maxLen }: { longest: number; maxLen: number }) {
  const pct = lengthScore(longest, maxLen)
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.pct}>{pct}%</span>
        <span className={styles.anchor}>
          best {longest} / possible {maxLen}
        </span>
      </div>
      <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
