import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { StrandsSetup } from './setup'

/**
 * strands's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 */
export function setupRows(
  setup: StrandsSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'band', label: 'Hint dictionary', value: difficultyValue(setup.band) },
    { key: 'hint_cost', label: 'Words per hint', value: String(setup.hint_cost) },
    { key: 'min_word_length', label: 'Shortest word', value: `${setup.min_word_length} letters` },
    timerRow(setup.timer),
  ]
}
