// cs-unmet

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import { AI_LEVEL_LABEL, type ScrabbleSetup } from './setup'

/**
 * scrabble's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * The AI row appears only when the dialog offered it AND some were seated —
 * a control that didn't apply produces no row.
 */
export function makeSetupRows(
  setup: ScrabbleSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'dict_2', label: 'Dictionary (2-letter)', value: difficultyValue(setup.dict_2) },
    { key: 'dict_3plus', label: 'Dictionary (longer)', value: difficultyValue(setup.dict_3plus) },
  ]
  if (mode === 'compete' && setup.ai_count > 0) {
    rows.push({
      key: 'ai_count',
      label: 'AI players',
      value: `${setup.ai_count} x ${AI_LEVEL_LABEL[setup.ai_level]}`,
    })
  }
  rows.push(makeTimerRow(setup.timer))
  return rows
}
