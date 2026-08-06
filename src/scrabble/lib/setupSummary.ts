import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { AI_LEVEL_LABEL, type ScrabbleSetup } from './setup'

/**
 * scrabble's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * The AI row appears only when the dialog offered it AND some were seated —
 * a control that didn't apply produces no row.
 */
export function setupRows(
  setup: ScrabbleSetup,
  mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'dict_2', label: 'Dictionary (2-letter)', value: difficultyValue(setup.dict_2) },
    { key: 'dict_3plus', label: 'Dictionary (longer)', value: difficultyValue(setup.dict_3plus) },
  ]
  if (mode === 'compete' && setup.ai_count > 0) {
    rows.push({
      key: 'ai_count',
      label: 'AI players',
      value: `${setup.ai_count} x ${AI_LEVEL_LABEL[setup.ai_level]}`,
    })
  }
  rows.push(timerRow(setup.timer))
  return rows
}
