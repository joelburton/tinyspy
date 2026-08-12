import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { centerLettersRow, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { RANKS } from '../../common/lib/game/rankLadder'
import type { SpellingbeeSetup } from './setup'

/**
 * spellingbee's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 *
 * Target rank appears only when one was chosen — a control that didn't apply
 * produces no row, rather than a row saying "none".
 *
 * The `Letters` row is the documented board-identity exception (setupRows.ts →
 * BOARD_KEY): it prints the board this game was actually built on, random or
 * hand-picked, in the same `A-CHIROT` shape the dialog's custom-letters fields
 * take back. It leads, right under the roster — on a kept record, WHICH board
 * this was outranks how it was configured.
 */
export function setupRows(
  setup: SpellingbeeSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
  /** The board's letters, or null while the game row is still loading. */
  board: { center: string; outer: string } | null = null,
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    ...centerLettersRow(board),
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
