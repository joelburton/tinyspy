// cs-blessed-connections

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Member } from '@/common/members/member'
import { setupRows } from './setupSummary'
import type { ConnectionsSetup } from './setup'

/**
 * Tests for connections' setup recap — the one array the info column and the
 * PDF both draw (common/setup-form/doc.md → Setup rows).
 *
 * `src/guards/setupRows.test.ts` already holds every game to the SHAPE of this
 * array: a row per setup key, the roster first, values that are strings. What
 * it cannot check is what the rows SAY, and it calls connections with a null
 * puzzle date — so the date formatting, the one piece of real logic here, runs
 * in no test at all. That is what this file is for.
 */

const SETUP: ConnectionsSetup = { timer: { kind: 'none' }, coop_style: 'free-for-all' }

const PLAYERS: Member[] = [
  { user_id: 'u1', username: 'ada', color: 'blue' },
  { user_id: 'u2', username: 'bea', color: 'green' },
]

/** The recap's value for one key, or undefined if the key produced no row. */
function valueOf(rows: { key: string; value: string }[], key: string) {
  return rows.find((r) => r.key === key)?.value
}

describe('connections setup recap', () => {
  it('leads with the roster, then pacing, the puzzle and the timer', () => {
    const rows = setupRows(SETUP, 'coop', PLAYERS, '2026-06-15')
    expect(rows.map((r) => r.key)).toEqual(['players', 'coop_style', 'puzzle_id', 'timer'])
    expect(rows.map((r) => r.label)).toEqual(['Players', 'Pacing', 'Puzzle', 'Timer'])
  })

  it('drops the pacing row in a race — a control that did not apply prints nothing', () => {
    const rows = setupRows(SETUP, 'compete', PLAYERS, '2026-06-15')
    expect(rows.map((r) => r.key)).toEqual(['players', 'puzzle_id', 'timer'])
  })

  it('names a board with no NYT date "custom puzzle" rather than leaving it blank', () => {
    expect(valueOf(setupRows(SETUP, 'coop', PLAYERS, null), 'puzzle_id')).toBe('custom puzzle')
  })
})

/**
 * The puzzle date is a CALENDAR date (`connections.puzzles.puzzle_date`), not
 * an instant, so the row must name the same day for every player wherever they
 * are. The trap is one line of parsing: `new Date(y, m - 1, d)` builds local
 * midnight, which a UTC-formatted row then prints as the day BEFORE for anyone
 * east of Greenwich.
 *
 * Forcing the clock to +14 is what makes that failure reachable — run in a US
 * timezone, a local-midnight parse formats correctly and the bug is invisible.
 * The assertions are on the day number rather than the whole sentence because
 * the row is formatted in the reader's locale, which the test does not fix.
 */
describe('the puzzle date, from the far side of the date line', () => {
  const realTz = process.env.TZ

  beforeAll(() => {
    process.env.TZ = 'Pacific/Kiritimati'
  })
  afterAll(() => {
    process.env.TZ = realTz
  })

  it('names the day on the puzzle, not the day before it', () => {
    const value = valueOf(setupRows(SETUP, 'coop', PLAYERS, '2026-06-15'), 'puzzle_id')!
    expect(value).toContain('15')
    expect(value).not.toContain('14')
    expect(value).toContain('2026')
  })

  it('holds across a year boundary, where the slip also moves the year', () => {
    const value = valueOf(setupRows(SETUP, 'coop', PLAYERS, '2026-01-01'), 'puzzle_id')!
    expect(value).toContain('2026')
    expect(value).not.toContain('2025')
  })
})
