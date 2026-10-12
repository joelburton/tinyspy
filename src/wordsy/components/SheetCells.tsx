// cs-unmet

import { IconFastest, IconOpponents, IconPlayer, IconWordOk } from '@/common/icons/icons'
import { answerMessage } from '../lib/answer'
import type { GBand, GSheetRow } from '../types'
import { BandSquare } from './BandSquare'
import styles from './scoresheet.module.css'

/*
 * The cells the two scoresheets build a row from, and the columns' headings —
 * compete's two bonuses, coop's clock and bonus, and the total — one
 * vocabulary, reached for together, so they share a file
 * (docs/code-conventions.md → Component names). Each heading says what its
 * column means in a readout tooltip (common/tooltips/doc.md → Readouts).
 */

const GLYPH_SIZE = 14

/** Coop's clock column's heading: hourglass and check, "the word beat the
 *  clock". */
export function SheetClockHeading() {
  return (
    <th
      className={styles.bonus}
      data-tooltip="Beat the clock: the word was in before time ran out"
      data-tooltip-on="readout"
    >
      <span className={styles.heading}>
        <IconFastest size={GLYPH_SIZE}/><IconWordOk size={GLYPH_SIZE}/>
      </span>
    </th>
  )
}

/** Coop's clock cell: a check for a word in before the clock ran out, else a
 *  dash. */
export function SheetBeatClock({ beatClock }: { beatClock: boolean }) {
  return beatClock ? <IconWordOk size={GLYPH_SIZE} data-testid="beat-clock"/> : <>–</>
}

/** Coop's band cell: the band the word was scored on, as the card draws it. */
export function SheetBand({ band }: { band: GBand }) {
  return <BandSquare band={band}/>
}

/** The beat-the-Fastest column's heading, its rule in glyphs: player >
 *  hourglass, "you scored above the Fastest". */
export function SheetBeatHeading() {
  return (
    <th
      className={styles.bonus}
      data-tooltip="Beat the Fastest: scored higher than the Fastest's word"
      data-tooltip-on="readout"
    >
      <span className={styles.heading}>
        <IconPlayer size={GLYPH_SIZE}/>&gt;<IconFastest size={GLYPH_SIZE}/>
      </span>
    </th>
  )
}

/** The Fastest's column's heading: hourglass ≥ players, "the Fastest tied or
 *  beat enough opponents". */
export function SheetFastestHeading() {
  return (
    <th
      className={styles.bonus}
      data-tooltip="Fastest's bonus: the Fastest tied or beat three opponents, or all of them if fewer"
      data-tooltip-on="readout"
    >
      <span className={styles.heading}>
        <IconFastest size={GLYPH_SIZE}/>≥<IconOpponents size={GLYPH_SIZE}/>
      </span>
    </th>
  )
}

/** Coop's bonus column's heading: +, "the bonus for beating the clock with
 *  15 or more". Compete has no such column: its bonuses are the two before. */
export function SheetCoopBonusHeading() {
  return (
    <th
      className={styles.bonus}
      data-tooltip="Bonus: beat the clock with 15 or more"
      data-tooltip-on="readout"
    >
      +
    </th>
  )
}

/** The row total's heading: =. */
export function SheetTotalHeading() {
  return (
    <th className={styles.num} data-tooltip="The round's total" data-tooltip-on="readout">
      =
    </th>
  )
}

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
