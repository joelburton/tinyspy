// cs-unmet

import type { Member } from '@/common/members/member'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import { DIFFICULTY_OPTIONS } from './setup'
import type { GSetup } from '../types'

/**
 * wordleone's setup rows — ONE array, rendered by the info column and the PDF
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
    { key: 'legal_band', label: 'Dictionary', value: dictBandValue(setup.legal_band) },
    {
      key: 'difficulty',
      label: 'Difficulty',
      value: DIFFICULTY_OPTIONS.find((o) => o.value === setup.difficulty)!.label,
    },
    makeTimerRow(setup.timer),
  ]
}
