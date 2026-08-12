import type { Member } from '../../common/lib/games'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { centerLettersRow, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import { RANKS } from '../../common/lib/game/rankLadder'
import type { WordwheelSetup } from './setup'

/**
 * wordwheel's setup recap — ONE array, rendered by the info column and the PDF
 * alike (docs/pdf.md → Setup rows). Order mirrors `components/SetupForm.tsx`.
 *
 * Two conditional controls: the target rank (only when one was chosen) and the
 * unique-letters constraint (only when it's on). Both omit rather than print a
 * "none"/"off" row — a record shouldn't assert a choice nobody made.
 *
 * The `Letters` row is the documented board-identity exception (setupRows.ts →
 * BOARD_KEY): it prints the wheel this game was actually built on, random or
 * hand-picked, in the same `A-BCDEFGHI` shape the dialog's custom-letters
 * fields take back — nine tiles, centre first. It leads, right under the
 * roster.
 */
export function setupRows(
  setup: WordwheelSetup,
  _mode: 'coop' | 'compete',
  players: Member[],
  /** The wheel's letters, or null while the game row is still loading. */
  board: { center: string; outer: string } | null = null,
): SetupRow[] {
  const rows: SetupRow[] = [
    rosterRow(players),
    ...centerLettersRow(board),
    { key: 'required', label: 'Dictionary (required)', value: difficultyValue(setup.required) },
    { key: 'legal', label: 'Dictionary (legal)', value: difficultyValue(setup.legal) },
  ]
  if (setup.target_rank !== null && setup.target_rank !== undefined) {
    rows.push({ key: 'target_rank', label: 'Target rank', value: RANKS[setup.target_rank] ?? '?' })
  }
  if (setup.unique_letters) {
    // Labelled for the dialog's own section ("Board constraints"), not "Letters":
    // the `Letters` row above now names the wheel itself, and two rows sharing a
    // label would read as one fact contradicting itself.
    rows.push({ key: 'unique_letters', label: 'Board constraint', value: 'unique letters only' })
  }
  rows.push(timerRow(setup.timer))
  return rows
}
