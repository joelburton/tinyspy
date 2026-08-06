import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { RANKS } from '../../common/lib/game/rankLadder'
import type { SpellingbeeSetup } from './setup'

/**
 * spellingbee's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 *
 * Target rank appears only when one was chosen — a control that didn't apply
 * produces no row, rather than a row saying "none".
 */
export function setupRows(
  setup: SpellingbeeSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    { key: 'required', label: 'Dictionary (required)', value: difficultyValue(setup.required) },
    { key: 'legal', label: 'Dictionary (legal)', value: difficultyValue(setup.legal) },
  ]
  if (setup.target_rank !== null && setup.target_rank !== undefined) {
    rows.push({
      key: 'target_rank',
      label: 'Target rank',
      value: RANKS[setup.target_rank] ?? '?',
    })
  }
  rows.push(timerRow(setup.timer))
  return rows
}
