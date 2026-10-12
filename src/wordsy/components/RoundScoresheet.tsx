// cs-unmet

import { DotActor } from '@/common/members/ActorMention'
import { makeRoundSheet } from '../lib/scoresheet'
import {
  SheetBand, SheetBeatClock, SheetBeatHeading, SheetBonus, SheetClockHeading, SheetCoopBonusHeading,
  SheetFastestHeading, SheetTotalHeading, SheetWord,
} from './SheetCells'
import type { GGameData, GRound } from '../types'
import styles from './scoresheet.module.css'

/**
 * A finished round's scoresheet, in the board's place until the next round
 * starts: a row per player, in the reveal's order. Who, the word, its score,
 * the bonus for beating the Fastest, the Fastest's own bonus (each column
 * headed by its rule in glyphs), the round's total under =, and a gold star
 * on the best total. In coop the one row is the team's word: who wrote it,
 * the word, its score, whether it beat the clock, the band it was scored on,
 * its bonus, and the total.
 */
export function RoundScoresheet({
  gd,
  round,
}: {
  gd: GGameData
  round: GRound
}) {
  const isCoop = gd.team !== null
  return (
    <div data-testid="round-scoresheet" className={styles.sheet}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th/>
            <th/>
            <th/>
            {isCoop ? <SheetClockHeading/> : <SheetBeatHeading/>}
            {isCoop ? <th className={styles.bonus}/> : <SheetFastestHeading/>}
            {isCoop ? <SheetCoopBonusHeading/> : <th className={styles.bonus}>+</th>}
            <SheetTotalHeading/>
            {!isCoop && <th className={styles.star}/>}
          </tr>
        </thead>
        <tbody>
          {makeRoundSheet(gd, round).map((row) => (
            <tr key={row.player.id}>
              <td><DotActor actor={row.player}/></td>
              <td><SheetWord row={row}/></td>
              <td className={styles.num}>{row.score}</td>
              {isCoop ? (
                <>
                  <td className={styles.bonus}><SheetBeatClock beatClock={row.beatClock!}/></td>
                  <td className={styles.bonus}><SheetBand band={row.band!}/></td>
                  <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
                </>
              ) : (
                <>
                  <td className={styles.bonus}><SheetBonus bonus={row.beatBonus}/></td>
                  <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
                  <td className={styles.bonus}/>
                </>
              )}
              <td className={styles.num}>{row.rowTotal}</td>
              {!isCoop && <td className={styles.star}>{row.isStar && '★'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
