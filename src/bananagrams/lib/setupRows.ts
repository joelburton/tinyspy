// cs-unmet

import type { Member } from '@/common/members/member'
import { makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import { dictBandValue } from '@/common/setup-form/dictBand'
import { WORD_CHECK_OPTIONS } from './setup'
import type { GSetup } from '../types'

/**
 * bananagrams's setup rows — ONE array, rendered by the info column and the
 * PDF alike (common/setup-form/doc.md → Setup rows). Order and words mirror
 * `components/SetupForm.tsx`: the setup rows are the dialog read back.
 *
 * The disclosure lives in `components/PlayArea.tsx` rather than an `InfoCol`,
 * this game being the v3 layout exception — the rows are the same either way.
 */
export function makeSetupRows(
  setup: GSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    makeRosterRow(players),
    {
      key: 'hand_size',
      label: 'Starter hand',
      value: `${setup.hand_size} tiles`,
    },
    { key: 'bunch_size', label: 'Bunch', value: `${setup.bunch_size} tiles` },
    {
      key: 'dump_to_bag',
      // `true` is the bag — out of play — and `false` is back into the bunch
      // (`GSetup.dump_to_bag`); the spec beside this file pins which
      // is which.
      label: 'Dumped tiles',
      value: setup.dump_to_bag
        ? 'to the bag (out of play)'
        : 'back to the bunch',
    },
    {
      key: 'word_check',
      label: 'Word check',
      value: WORD_CHECK_OPTIONS.find((o) => o.value ===
        setup.word_check)?.label ?? setup.word_check,
    },
  ]
  // The two bands are only meaningful when the board is checked at all, so they
  // follow the control they qualify and vanish with it.
  if (setup.word_check !== 'off') {
    rows.push(
      {
        key: 'dict_2',
        label: 'Dictionary (2-letter)',
        value: dictBandValue(setup.dict_2),
      },
      {
        key: 'dict_3plus',
        label: 'Dictionary (longer)',
        value: dictBandValue(setup.dict_3plus),
      },
    )
  }
  rows.push(makeTimerRow(setup.timer))
  return rows
}
