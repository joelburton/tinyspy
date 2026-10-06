// cs-unmet

import { BOARD_SIZE } from '../lib/board'
import styles from './StateLine.module.css'
import type { GFacts, GGameData } from '../types'

/**
 * The game in two fractions — letters covered, and words spent — my side's
 * facts, `gd.me`: the team's chain in coop, my own in compete; par is the
 * puzzle's.
 *
 * A hint or spoiler taken is deliberately NOT here: the event log is its record, and a
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
export function StateLine({ facts, puzzle }: { facts: GFacts; puzzle: GGameData['puzzle'] }) {
  return (
    <div className={styles.stats}>
      <div className={styles.statCell}>
        <span className={styles.statLabel}>Letters</span>
        <span className={styles.statValue}>
          {facts.nCoveredLetters}
          <span className={styles.statOf}>/{BOARD_SIZE}</span>
        </span>
      </div>
      <div className={styles.statCell}>
        <span className={styles.statLabel}>Words (par {puzzle.nParWords})</span>
        <span className={styles.statValue}>
          {facts.nWordsUsed}
          <span className={styles.statOf}>/{facts.maxWords}</span>
        </span>
      </div>
    </div>
  )
}
