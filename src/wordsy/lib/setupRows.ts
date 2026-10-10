// cs-unmet

import type { Member } from '@/common/members/member'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { makeRosterRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import { ROUND_STYLE_OPTIONS } from './setup'
import type { GSetup } from '../types'

/**
 * wordsy's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order and words mirror
 * `components/SetupForm.tsx`. No Timer row: the setup's `timer` is fixed at
 * none, and the round's clock is the Round row.
 */
export function makeSetupRows(
  setup: GSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    { key: 'legal_band', label: 'Dictionary', value: dictBandValue(setup.legal_band) },
    {
      key: 'round_style',
      label: 'Round',
      value: ROUND_STYLE_OPTIONS.find((o) => o.value === setup.round_style)!.label,
    },
  ]
}
