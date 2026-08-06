import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { RANKS } from '../../common/lib/game/rankLadder'
import type { WordwheelSetup } from './setup'

/**
 * wordwheel's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * Two conditional controls: the target rank (only when one was chosen) and the
 * unique-letters constraint (only when it's on). Both omit rather than print a
 * "none"/"off" row — a record shouldn't assert a choice nobody made.
 */
export function setupRows(
  setup: WordwheelSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    { key: 'required', label: 'Dictionary (required)', value: difficultyValue(setup.required) },
    { key: 'legal', label: 'Dictionary (legal)', value: difficultyValue(setup.legal) },
  ]
  if (setup.target_rank !== null && setup.target_rank !== undefined) {
    rows.push({ key: 'target_rank', label: 'Target rank', value: RANKS[setup.target_rank] ?? '?' })
  }
  if (setup.unique_letters) {
    rows.push({ key: 'unique_letters', label: 'Letters', value: 'unique only' })
  }
  rows.push(timerRow(setup.timer))
  return rows
}
