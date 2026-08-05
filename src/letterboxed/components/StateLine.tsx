import { BOARD_SIZE, PAR } from '../lib/board'
import styles from './PlayArea.module.css'

/**
 * The game in two fractions — letters covered, and words spent.
 *
 * Help taken is deliberately NOT here: the turn log is its record, and a
 * counter beside the score would read as something the game is holding against
 * you.
 *
 * Info-column only — letterboxed deliberately has NO mobile status bar
 * (docs/mobile.md's adoption rule): on a phone the board itself shows which
 * letters are covered, the chain strip shows the words, and the accepted-word
 * pill restates the cap. This line is the desktop/sheet summary of the same.
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
