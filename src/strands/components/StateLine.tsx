// cs-unmet

import type { GGameData } from '../types'
import styles from './StateLine.module.css'

/**
 * The game in one line: the words found, and the hints used beside them once
 * there are any — my side's facts, `gd.me`: the team's in coop, my own in
 * compete. A count only, never "of N": the TOTAL is part of the answer.
 *
 * A fragment: the caller wraps it in the info column's state paragraph.
 */
export function StateLine({ facts }: { facts: GGameData['me'] }) {
  return (
    <>
      {facts.nFoundPuzzleWords} {facts.nFoundPuzzleWords === 1 ? 'word' : 'words'}
      {facts.nHintsUsed > 0 && (
        <span className={styles.hintsUsed}>
          {' '}· {facts.nHintsUsed} hint{facts.nHintsUsed === 1 ? '' : 's'} used
        </span>
      )}
    </>
  )
}
