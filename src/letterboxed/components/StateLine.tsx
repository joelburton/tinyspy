import { BOARD_SIZE, PAR } from '../lib/board'
import styles from './PlayArea.module.css'

/**
 * The game in two fractions — letters covered, and words spent.
 *
 * Help taken is deliberately NOT here: the turn log is its record, and a
 * counter beside the score would read as something the game is holding against
 * you.
 *
 * ONE component, rendered in TWO places: the info column on desktop, and the
 * `<MobileStatusBar>` above the board on a phone, where the info column is
 * off-canvas in the InfoSheet. Sharing the component rather than re-wording a
 * copy is what stops the two surfaces drifting (see MobileStatusBar's note).
 *
 * Naming PAR in the words label is what makes that fraction readable: "3/5"
 * alone says nothing, "3/5" against "par 2" says you are three over.
 */
export function StateLine({
  lettersCovered,
  wordsUsed,
  maxWords,
}: {
  lettersCovered: number
  wordsUsed: number
  maxWords: number
}) {
  return (
    <div className={styles.stats}>
      <div className={styles.statCell}>
        <span className={styles.statLabel}>Letters</span>
        <span className={styles.statValue}>
          {lettersCovered}
          <span className={styles.statOf}>/{BOARD_SIZE}</span>
        </span>
      </div>
      <div className={styles.statCell}>
        <span className={styles.statLabel}>Words (par {PAR})</span>
        <span className={styles.statValue}>
          {wordsUsed}
          <span className={styles.statOf}>/{maxWords}</span>
        </span>
      </div>
    </div>
  )
}
