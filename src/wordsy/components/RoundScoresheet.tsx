// cs-unmet

import { DotActor } from '@/common/members/ActorMention'
import { makeRoundSheet } from '../lib/scoresheet'
import { SheetBonus, SheetWord } from './SheetCells'
import type { GGameData, GRound } from '../types'
import styles from './scoresheet.module.css'

/**
 * A finished round's scoresheet, in the board's place until the next round
 * starts: a row per player, in the reveal's order. Who, the word, its score,
 * the Fastest's bonus under ⏳, the bonus for beating them under >⏳, the
 * round's total under =, and a gold star on the best total.
 */
export function RoundScoresheet({
  gd,
  round,
}: {
  gd: GGameData
  round: GRound
}) {
  return (
    <div data-testid="round-scoresheet" className={styles.sheet}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th/>
            <th/>
            <th/>
            <th className={styles.bonus}>⏳</th>
            <th className={styles.bonus}>&gt;⏳</th>
            <th className={styles.num}>=</th>
            <th className={styles.star}/>
          </tr>
        </thead>
        <tbody>
          {makeRoundSheet(gd, round).map((row) => (
            <tr key={row.player.id}>
              <td><DotActor actor={row.player}/></td>
              <td><SheetWord row={row}/></td>
              <td className={styles.num}>{row.score}</td>
              <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
              <td className={styles.bonus}><SheetBonus bonus={row.beatBonus}/></td>
              <td className={styles.num}>{row.rowTotal}</td>
              <td className={styles.star}>{row.isStar && '★'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
