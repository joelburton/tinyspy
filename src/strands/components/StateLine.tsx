// cs-unmet

import type { GStateLineData } from '../types'
import styles from './StateLine.module.css'

/**
 * The game in one line: the words found, and the hints used beside them once
 * there are any — the team's in coop, my own in compete (`gd.stateLineData`
 * decides which). A count only, never "of N": the TOTAL is part of the answer.
 *
 * A fragment: the caller wraps it in the info column's state paragraph.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      {data.nFoundWords} {data.nFoundWords === 1 ? 'word' : 'words'}
      {data.nHintsUsed > 0 && (
        <span className={styles.hintsUsed}>
          {' '}· {data.nHintsUsed} hint{data.nHintsUsed === 1 ? '' : 's'} used
        </span>
      )}
    </>
  )
}
