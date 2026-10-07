// cs-unmet

import type { Member } from '@/common/members/member'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'

/**
 * stackdown's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * No "Tiles: 30" or "Words to clear: 6": both are game CONSTANTS rather than
 * controls the dialog offers — the setup rows are the dialog read back, nothing
 * more. They belong in Help.
 */
export function makeSetupRows(
  setup: GSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    { key: 'band', label: 'Dictionary', value: dictBandValue(setup.band) },
    makeTimerRow(setup.timer),
  ]
}
