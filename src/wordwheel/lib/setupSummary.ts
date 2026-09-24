// cs-blessed-wordwheel

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { centerLettersRow, rosterRow, timerRow, type SetupRow } from '@/common/setup-form/setupRows'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import type { WordwheelSetup } from './setup'

/**
 * wordwheel's setup recap — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows): the roster, the wheel's
 * letters, the two dictionary bands, the target rank when one was chosen, the
 * unique-letters constraint when it's on (a control that didn't apply produces
 * no row, rather than a row saying "none" or "off"), and the timer.
 *
 * The `Letters` row is the documented board-identity exception (setupRows.ts →
 * BOARD_KEY): it prints the wheel this game was actually built on, random or
 * hand-picked, in the same `A-BCDEFGHI` shape the dialog's custom-letters
 * field takes back — nine tiles, center first. It leads, right under the
 * roster — on a kept record, WHICH board this was outranks how it was
 * configured.
 */
export function setupRows(
  setup: WordwheelSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
  // The wheel's letters; null draws no Letters row.
  board: { center: string; outer: string } | null = null,
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    ...centerLettersRow(board),
    { key: 'required', label: 'Dictionary (required)', value: difficultyValue(setup.required) },
    { key: 'legal', label: 'Dictionary (legal)', value: difficultyValue(setup.legal) },
  ]
  if (setup.target_rank !== null && setup.target_rank !== undefined) {
    rows.push({ key: 'target_rank', label: 'Target rank', value: RANKS[setup.target_rank] ?? '?' })
  }
  if (setup.unique_letters) {
    // Labeled for the dialog's own section ("Board constraints"), not "Letters":
    // the `Letters` row above now names the wheel itself, and two rows sharing a
    // label would read as one fact contradicting itself.
    rows.push({ key: 'unique_letters', label: 'Board constraint', value: 'unique letters only' })
  }
  rows.push(timerRow(setup.timer))
  return rows
}
