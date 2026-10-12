// cs-unmet

import { cls } from '@/common/utils/cls'
import { DotActor } from '@/common/members/ActorMention'
import { makeGameSheets } from '../lib/scoresheet'
import {
  SheetBand, SheetBandHeading, SheetBeatClock, SheetBeatHeading, SheetBonus, SheetClockHeading, SheetCoopBonusHeading,
  SheetFastestHeading, SheetPenaltyDot, SheetTotalHeading, SheetWord,
} from './SheetCells'
import type { GGameData } from '../types'
import styles from './scoresheet.module.css'

/**
 * The whole game's scoresheet, in the board's place once the game has ended:
 * a table per player, the winner's first, a row per round with the round's
 * number first, and the total under them. Its headings are the round sheet's:
 * only the bonus columns and = are named, since a word and its score need no
 * label. Each player's lowest word scores, which the total drops, are struck.
 * As tall as its tables; a longer one than the column scrolls inside its frame.
 *
 * In coop the one table is the team's, headed by the card's title or "The
 * team": a row per round with its writer, whether the word beat the clock and
 * the band it was scored on (a red dot for a penalty); under the rows, the
 * penalties, a dot each, and their cost, then the total.
 */
export function GameScoresheet({ gd }: { gd: GGameData }) {
  const team = gd.team
  return (
    <div data-testid="game-scoresheet" className={cls(styles.sheet, styles.gameSheet)}>
      {makeGameSheets(gd).map(({ player, rows, total }) => (
        <section key={player?.id ?? 'team'}>
          {/* The table's owner: named on a phone too, where a row's dot alone
              is enough. */}
          <p className={styles.player}>
            {player !== null ? <DotActor actor={player} show="both"/> : (team!.title ?? 'The team')}
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th/>
                <th/>
                <th/>
                {team !== null ? <SheetClockHeading/> : <SheetBeatHeading/>}
                {team !== null ? <SheetBandHeading/> : <SheetFastestHeading/>}
                {team !== null && <SheetCoopBonusHeading/>}
                <SheetTotalHeading/>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.num}>
                  <td>{row.num}</td>
                  <td className={cls(row.isStruck && styles.struck)}>
                    {team !== null && <DotActor actor={row.player}/>}
                    {team !== null && ' '}
                    <SheetWord row={row}/>
                  </td>
                  <td className={cls(styles.num, row.isStruck && styles.struck)}>{row.score}</td>
                  {team !== null ? (
                    <>
                      <td className={styles.bonus}><SheetBeatClock beatClock={row.beatClock!}/></td>
                      <td className={styles.bonus}><SheetBand band={row.band!} penalty={row.penalty!}/></td>
                      <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
                    </>
                  ) : (
                    <>
                      <td className={styles.bonus}><SheetBonus bonus={row.beatBonus}/></td>
                      <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
                    </>
                  )}
                  <td className={styles.num}>{row.rowTotal}</td>
                </tr>
              ))}
              {team !== null && team.nPenalties > 0 && (
                <tr className={styles.penaltiesRow}>
                  <td colSpan={6}>
                    {/* A dot a penalty, as the band column marks them. */}
                    {Array.from({ length: team.nPenalties }, (_, i) => <SheetPenaltyDot key={i}/>)}
                    {' '}
                    {team.nPenalties === 1 ? 'penalty' : 'penalties'}
                  </td>
                  <td className={styles.num}>−{2 * team.nPenalties}</td>
                </tr>
              )}
              <tr className={styles.grandTotal}>
                {/* Under every column but the total's: six in coop, five in
                    compete. */}
                <td colSpan={team !== null ? 6 : 5}/>
                <td className={styles.num}>{total}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
