// cs-unmet

import type { GGameData } from '../types'
import styles from './StateLine.module.css'

/**
 * The game in one line: "Round 3 of 7 · 24 pts" — the round in play and my
 * total so far, the best five rounds plus every bonus. Drawn in the info
 * column and the phone's status bar, which is why it is one component.
 */
export function StateLine({ gd }: { gd: GGameData }) {
  return (
    <span className={styles.stateLine}>
      Round <strong>{gd.round.num}</strong> of 7
      <span className={styles.dot}>·</span>
      <strong>{gd.me.total}</strong> pts
    </span>
  )
}
