// cs-unmet

import type { GGameData } from '../types'
import styles from './StateLine.module.css'

/**
 * The game in one line: "Round 3 of 7 · 24 pts" — the round in play and my
 * total so far, the best rounds (`nBestRounds`) plus every bonus; in coop the
 * team's, less the penalties, which it counts ("· 1 penalty") once there are
 * any. Drawn in the info column; the bar over the board says the round and
 * the total its own shorter way (`BoardCol`).
 */
export function StateLine({ gd }: { gd: GGameData }) {
  const nPenalties = gd.team?.nPenalties ?? 0
  return (
    <span className={styles.stateLine}>
      Round <strong>{gd.round.num}</strong> of {gd.nRounds}
      <span className={styles.dot}>·</span>
      <strong>{gd.me.total}</strong> pts
      {nPenalties > 0 && (
        <>
          <span className={styles.dot}>·</span>
          <strong>{nPenalties}</strong> {nPenalties === 1 ? 'penalty' : 'penalties'}
        </>
      )}
    </span>
  )
}
