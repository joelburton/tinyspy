// cs-blessed-connections

import type { Member } from '@/common/members/member'
import { coopRows, rosterRow, timerRow, type SetupRow } from '@/common/setup-form/setupRows'
import type { ConnectionsSetup } from './setup'

/** Format a puzzle's NYT date (`YYYY-MM-DD`) for the recap. Parsed as UTC so a
 *  calendar date never shifts by a local-tz offset. */
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
 * connections' setup recap — ONE array, rendered by the info column and the
 * PDF alike (common/setup-form/doc.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`. What is fixed about a puzzle (sixteen tiles,
 * four categories, four mistakes) is no row, since the dialog offers no
 * control for it.
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
