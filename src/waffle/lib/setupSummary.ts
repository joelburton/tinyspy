import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { WaffleSetup } from './setup'

/**
 * waffle's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * Swaps are quoted against PAR the way the form asks for them — a bare cap says
 * nothing on its own, while "par 10 + 3 extra" says exactly how much slack there
 * is. Par is per-BOARD (the generator's minimum), so it's passed in rather than
 * read off the setup.
 */
export function setupRows(
  setup: WaffleSetup,
  mode: 'coop' | 'compete',
  players: Member[],
  parSwaps: number,
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'difficulty', label: 'Dictionary', value: difficultyValue(setup.difficulty) },
    {
      key: 'extra_swaps',
      label: 'Swaps',
      value: `${parSwaps + setup.extra_swaps} (par ${parSwaps} + ${setup.extra_swaps} extra)`,
    },
    timerRow(setup.timer),
  ]
}
