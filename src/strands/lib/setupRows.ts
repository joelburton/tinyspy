// cs-unmet

import type { Member } from '@/common/members/member'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'

/**
 * strands's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'band', label: 'Hint dictionary', value: dictBandValue(setup.band) },
    { key: 'hint_cost', label: 'Words per hint', value: String(setup.hint_cost) },
    { key: 'min_word_length', label: 'Shortest word', value: `${setup.min_word_length} letters` },
    makeTimerRow(setup.timer),
  ]
}
