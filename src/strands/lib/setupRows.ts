// cs-unmet

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { makeCoopRows, makeRosterRow, makeTimerRow, type SetupRow } from '@/common/setup-form/setupRows'
import type { StrandsSetup } from './setup'

/**
 * strands's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function makeSetupRows(
  setup: StrandsSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'band', label: 'Hint dictionary', value: difficultyValue(setup.band) },
    { key: 'hint_cost', label: 'Words per hint', value: String(setup.hint_cost) },
    { key: 'min_word_length', label: 'Shortest word', value: `${setup.min_word_length} letters` },
    makeTimerRow(setup.timer),
  ]
}
