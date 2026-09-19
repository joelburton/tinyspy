// cs-unmet

import type { Member } from '@/common/members/member'
import { rosterRow, timerRow, type SetupRow } from '@/common/setup-form/setupRows'
import { difficultyValue } from '@/common/setup-form/difficulty'
import { WORD_CHECK_OPTIONS, type BananagramsSetup } from './setup'

/**
 * bananagrams's setup recap — ONE array, rendered by the info column and the
 * PDF alike (common/setup-form/doc.md → Setup rows). Order and words mirror
 * `components/SetupForm.tsx`: the recap is the dialog read back.
 *
 * The disclosure lives in `components/PlayArea.tsx` rather than an `InfoCol`,
 * this game being the v3 layout exception — the rows are the same either way.
 */
export function setupRows(
  setup: BananagramsSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    { key: 'hand_size', label: 'Starter hand', value: `${setup.hand_size} tiles` },
    { key: 'bunch_size', label: 'Bunch', value: `${setup.bunch_size} tiles` },
    {
      key: 'dump_to_bag',
      // `true` is the bag — out of play — and `false` is back into the bunch
      // (`BananagramsSetup.dump_to_bag`); the spec beside this file pins which
      // is which.
      label: 'Dumped tiles',
      value: setup.dump_to_bag ? 'to the bag (out of play)' : 'back to the bunch',
    },
    {
      key: 'word_check',
      label: 'Word check',
      value: WORD_CHECK_OPTIONS.find((o) => o.value === setup.word_check)?.label ?? setup.word_check,
    },
  ]
  // The two bands are only meaningful when the board is checked at all, so they
  // follow the control they qualify and vanish with it.
  if (setup.word_check !== 'off') {
    rows.push(
      { key: 'dict_2', label: 'Dictionary (2-letter)', value: difficultyValue(setup.dict_2) },
      { key: 'dict_3plus', label: 'Dictionary (longer)', value: difficultyValue(setup.dict_3plus) },
    )
  }
  rows.push(timerRow(setup.timer))
  return rows
}
