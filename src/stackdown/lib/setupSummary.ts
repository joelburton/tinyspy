import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { StackdownSetup } from './setup'

/**
 * stackdown's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * "Tiles: 30" and "Words to clear: 6" have gone. Both were on the old
 * info-column list, and both are game CONSTANTS rather than controls the dialog
 * offers — the recap is the dialog read back, nothing more. They belong in Help.
 */
export function setupRows(
  setup: StackdownSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    { key: 'band', label: 'Dictionary', value: difficultyValue(setup.band) },
    timerRow(setup.timer),
  ]
}
