import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { WordiplySetup } from './setup'

/**
 * wordiply's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function setupRows(
  setup: WordiplySetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'difficulty', label: 'Dictionary', value: difficultyValue(setup.difficulty) },
    timerRow(setup.timer),
  ]
}
