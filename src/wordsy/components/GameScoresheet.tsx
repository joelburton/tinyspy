// cs-unmet

import { cls } from '@/common/utils/cls'
import { DotActor } from '@/common/members/ActorMention'
import { makeGameSheets } from '../lib/scoresheet'
import { SheetBonus, SheetWord } from './SheetCells'
import type { GGameData } from '../types'
import styles from './scoresheet.module.css'

/**
 * The whole game's scoresheet, in the board's place once the game has ended:
 * a table per player, the winner's first, a row per round with the round's
 * number first, and the total under them. Each player's lowest word scores,
 * which the total drops, are struck. Scrolls inside its frame.
 */
export function GameScoresheet({ gd }: { gd: GGameData }) {
  return (
    <div data-testid="game-scoresheet" className={cls(styles.sheet, styles.gameSheet)}>
      {makeGameSheets(gd).map(({ player, rows, total }) => (
        <section key={player.id}>
          {/* The table's owner: named on a phone too, where a row's dot alone
              is enough. */}
          <p className={styles.player}><DotActor actor={player} show="both"/></p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th/>
                <th>Word</th>
                <th className={styles.num}>Score</th>
                <th className={styles.bonus}>⏳</th>
                <th className={styles.bonus}>&gt;⏳</th>
                <th className={styles.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.num}>
                  <td>{row.num}</td>
                  <td className={cls(row.isStruck && styles.struck)}><SheetWord row={row}/></td>
                  <td className={cls(styles.num, row.isStruck && styles.struck)}>{row.score}</td>
                  <td className={styles.bonus}><SheetBonus bonus={row.fastestBonus}/></td>
                  <td className={styles.bonus}><SheetBonus bonus={row.beatBonus}/></td>
                  <td className={styles.num}>{row.rowTotal}</td>
                </tr>
              ))}
              <tr className={styles.grandTotal}>
                <td colSpan={5}/>
                <td className={styles.num}>{total}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
