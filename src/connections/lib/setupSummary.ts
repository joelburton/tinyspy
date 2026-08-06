import type { Member } from '../../common/lib/games'
import { coopRows, rosterRow, timerRow, type SetupRow } from '../../common/lib/game/setupRows'
import type { ConnectionsSetup } from './setup'

/** Format a puzzle's NYT date (`YYYY-MM-DD`) for the recap. Parsed as UTC so a
 *  calendar date never shifts by a local-tz offset (matches Calendar). */
function formatPuzzleDate(d: string | null): string {
  if (!d) return 'custom puzzle'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * connections's setup recap — ONE array, rendered by the info column and the
 * PDF alike (docs/pdf.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`.
 *
 * "Words: 16", "Categories: 4" and "Mistakes allowed: 4" have gone. All three
 * were on the old info-column list and none is a control the dialog offers —
 * they're fixed properties of a Connections puzzle. The recap is the dialog
 * read back; the rest belongs in Help.
 */
export function setupRows(
  setup: ConnectionsSetup,
  mode: 'coop' | 'compete',
  players: Member[],
  puzzleDate: string | null,
): SetupRow[] {
  return [
    rosterRow(players),
    ...coopRows(setup, mode, players),
    { key: 'puzzle_id', label: 'Puzzle', value: formatPuzzleDate(puzzleDate) },
    timerRow(setup.timer),
  ]
}
