// cs-unmet

import styles from './LengthScoreBar.module.css'

/**
 * The length-score readout — a horizontal bar filled to the length score, the
 * builder's `round(100 * longest / maxLen)`. Shown ONLY once the game has
 * ended: mid-game the info column shows a plain "guesses n/5" instead, because
 * the score is an end-only reveal (the "length only during play" rule).
 *
 * The label reads "best N / possible M" so the percentage has a concrete
 * anchor (your longest guess vs the longest possible word).
 */
export function LengthScoreBar({
  lengthScore,
  longestWordLen,
  maxWordLen,
}: {
  lengthScore: number
  longestWordLen: number
  maxWordLen: number
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.pct}>{lengthScore}%</span>
        <span className={styles.anchor}>
          best {longestWordLen} / possible {maxWordLen}
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={lengthScore}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ width: `${lengthScore}%` }} />
      </div>
    </div>
  )
}
