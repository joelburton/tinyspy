// cs-unmet

import type { Member } from '@/common/members/member'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { makeCoopRows, makeRosterRow, makeTimerRow, type SetupRow } from '@/common/setup-form/setupRows'
import type { WordiplySetup } from './setup'

/**
 * wordiply's setup rows — ONE array, rendered by the info column and the PDF
 * alike (common/setup-form/doc.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function makeSetupRows(
  setup: WordiplySetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'difficulty', label: 'Dictionary', value: difficultyValue(setup.difficulty) },
    makeTimerRow(setup.timer),
  ]
}
