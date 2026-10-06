// cs-unmet

import type { Member } from '@/common/members/member'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'
import { paletteOf } from './setup'

/**
 * setgame's setup rows — ONE array, rendered by the info column and the PDF
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
    {
      key: 'deck',
      label: 'Deck',
      value: setup.deck === 'junior' ? 'Junior (27 cards, all solid)' : 'Full (81 cards)',
    },
    {
      key: 'palette',
      label: 'Colors',
      value: paletteOf(setup) === 'colorblind'
        ? 'Colorblind-safe (blue / orange / magenta)'
        : 'Traditional (red / green / purple)',
    },
    makeTimerRow(setup.timer),
  ]
}
