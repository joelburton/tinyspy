// cs-unmet

import { answerMessage } from '../lib/answer'
import type { GSheetRow } from '../types'
import styles from './scoresheet.module.css'

/*
 * The cells the two scoresheets build a row from — one vocabulary, reached
 * for together, so they share a file (docs/code-conventions.md → Component
 * names).
 */

/** The row's word in capitals, or "no word". */
export function SheetWord({ row }: { row: GSheetRow }) {
  return row.word === ''
    ? <span className={styles.noWord}>{answerMessage({ answerType: 'no_word' }).text}</span>
    : <span className={styles.word}>{row.word}</span>
}

/** A bonus column's cell: "+2", or a dash for none. */
export function SheetBonus({ bonus }: { bonus: number | null }) {
  return <>{bonus === null ? '–' : `+${bonus}`}</>
}
