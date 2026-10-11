// cs-unmet

import { cls } from '@/common/utils/cls'
import { DotActor } from '@/common/members/ActorMention'
import { answerMessage } from '../lib/answer'
import { makeGameSheets, makeRoundSheet } from '../lib/scoresheet'
import type { GGameData, GRound, GSheetRow } from '../types'
import styles from './Scoresheet.module.css'

/**
 * A finished round's scoresheet, in the board's place until the next round
 * starts: a row per player — who, the word, its score, the Fastest's bonus
 * under ⏳, the bonus for
 * beating them under >⏳, the round's total under =, and a gold star for
 * the best total.
 */
export function RoundScoresheet({
  gd,
  round,
}: {
  gd: GGameData
  round: GRound
}) {
  return (
    <div
      data-testid="round-scoresheet"
      className={styles.sheet}
    >
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

/**
 * The whole game's scoresheet, in the board's place once the game has ended:
 * a table per player, the winner's first, a row per round (its number
 * under the player's name) and the total under them. Each player's lowest word scores, which the total drops, are
 * struck. Scrolls inside its frame.
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

/** The row's word in capitals, or "no word". */
function SheetWord({ row }: { row: GSheetRow }) {
  return row.word === ''
    ? <span className={styles.noWord}>{answerMessage({ answerType: 'no_word' }).text}</span>
    : <span className={styles.word}>{row.word}</span>
}

/** A bonus column's cell: "+2", or a dash for none. */
function SheetBonus({ bonus }: { bonus: number | null }) {
  return <>{bonus === null ? '–' : `+${bonus}`}</>
}

