// cs-blessed-connections

import type { Member } from '@/common/members/member'
import { makeCoopRows, makeRosterRow, makeTimerRow } from '@/common/setup-form/setupRows'
import type { SetupRow } from '@/common/setup-form/types'
import type { GSetup } from '../types'

/** Format a puzzle's NYT date (`YYYY-MM-DD`) for its setup row. Parsed as UTC so a
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
 * connections' setup rows — ONE array, rendered by the info column and the
 * PDF alike (common/setup-form/doc.md → Setup rows). Order mirrors
 * `components/SetupForm.tsx`. What is fixed about a puzzle (sixteen tiles,
 * four categories, four mistakes) is no row, since the dialog offers no
 * control for it.
 */
export function makeSetupRows(
  setup: GSetup,
  mode: 'coop' | 'compete',
  players: Member[],
  puzzleDate: string | null,
): SetupRow[] {
  return [
    makeRosterRow(players),
    ...makeCoopRows(setup, mode, players),
    { key: 'puzzle_id', label: 'Puzzle', value: formatPuzzleDate(puzzleDate) },
    makeTimerRow(setup.timer),
  ]
}
