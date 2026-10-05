// cs-unmet

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'

/**
 * stackdown's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * "Tiles: 30" and "Words to clear: 6" have gone. Both were on the old
 * info-column list, and both are game CONSTANTS rather than controls the dialog
 * offers — the setup rows are the dialog read back, nothing more. They belong in Help.
 */
export function makeSetupRows(
  setup: GSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    { key: 'band', label: 'Dictionary', value: difficultyValue(setup.band) },
    makeTimerRow(setup.timer),
  ]
}
