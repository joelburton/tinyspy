import type { Member } from '../../common/lib/games'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { BananagramsSetup } from './setup'

/**
 * bananagrams's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
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
      key: 'word_check',
      label: 'Words',
      value: setup.word_check === 'off' ? 'not checked' : `checked (${setup.word_check})`,
    },
    {
      key: 'dump_to_bag',
      label: 'Dumped tiles',
      value: setup.dump_to_bag ? 'back to the bunch' : 'out of play',
    },
  ]
  // The two bands are only meaningful when the board is checked at all, so they
  // follow the control they qualify and vanish with it. Neither surface used to
  // show them — the roster-wide test caught that, which is what it's for.
  if (setup.word_check !== 'off') {
    rows.push(
      { key: 'dict_2', label: 'Dictionary (2-letter)', value: difficultyValue(setup.dict_2) },
      { key: 'dict_3plus', label: 'Dictionary (longer)', value: difficultyValue(setup.dict_3plus) },
    )
  }
  rows.push(timerRow(setup.timer))
  return rows
}
