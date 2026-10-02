// cs-blessed-wordle

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import {
  makeCoopRows,
  makeRosterRow,
  makeTimerRow,
  type SetupRow,
} from '@/common/setup-form/setupRows'
import type { GSetup } from '../types'

/** The setup row's value for the answer band. `0` = the curated NYT-Wordle
 *  answer list; `1..6` = a clean word of that difficulty band or easier. */
function answerBandValue(n: number): string {
  return n === 0 ? 'NYT Wordle list' : `${difficultyValue(n)} or easier`
}

/**
 * wordle's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'max_guesses', label: 'Guesses', value: String(setup.max_guesses) },
    { key: 'answer_band', label: 'Answer', value: answerBandValue(setup.answer_band) },
    { key: 'legal_band', label: 'Dictionary', value: difficultyValue(setup.legal_band) },
    makeTimerRow(setup.timer),
  ]
}
