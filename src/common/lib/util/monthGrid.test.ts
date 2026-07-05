import { describe, expect, it } from 'vitest'
import { buildMonthGrid } from './monthGrid'

/**
 * `buildMonthGrid` is the pure month-layout helper inside the
 * Calendar component — given (year, month0), returns the array of
 * cells (or `null`s for leading-blank / trailing-pad cells) that
 * the calendar renders. The boundary conditions matter:
 *
 *   - leading blanks: how many `null`s come before day 1 (=
 *     the 1st's day-of-week in UTC, Sunday = 0)
 *   - day count: how many real days in the month
 *   - trailing pad: enough `null`s to round the array length up
 *     to a multiple of 7 so the grid has clean rows
 *   - date format: `YYYY-MM-DD`, zero-padded month and day
 *
 * Months exercised:
 *   - 2026-06 (June 2026 — the current month at writing time;
 *     starts Monday)
 *   - 2024-02 (Feb 2024, leap year — 29 days, starts Thursday)
 *   - 2023-12 (Dec 2023 — 31 days, year boundary)
 *
 * The TZ thing matters here: the helper uses `Date.UTC(...)`
 * throughout so the grid is the same regardless of where the
 * user's clock thinks it is. We assert against expected strings
 * — if a TZ regression slips in, the strings drift.
 */
describe('buildMonthGrid', () => {
  it('returns a length that is a multiple of 7', () => {
    // Any month — the grid always rounds to a clean row count.
    for (const [year, month] of [
      [2026, 5],
      [2024, 1],
      [2023, 11],
      [2024, 0], // edge: Jan 2024 starts Monday, ends Wed → trailing pad
    ]) {
      const cells = buildMonthGrid(year, month)
      expect(cells.length % 7).toBe(0)
    }
  })

  it('renders June 2026 with the expected leading blanks + day count', () => {
    // June 2026: 1st is a Monday → 1 leading blank.
    // 30 days. Total: 1 + 30 = 31 → rounds up to 35 (5 weeks).
    const cells = buildMonthGrid(2026, 5)
    expect(cells.length).toBe(35)
    // First Sunday slot is null (leading blank for Monday-start).
    expect(cells[0]).toBeNull()
    // Day 1 lands in slot 1 (Monday column).
    expect(cells[1]).toEqual({ day: 1, dateStr: '2026-06-01' })
    // Day 30 is the last real day; everything after is null.
    expect(cells[30]).toEqual({ day: 30, dateStr: '2026-06-30' })
    expect(cells[31]).toBeNull()
    expect(cells[34]).toBeNull()
  })

  it('handles leap-year February (Feb 2024)', () => {
    // Feb 2024: 1st is a Thursday → 4 leading blanks.
    // 29 days (leap). Total: 4 + 29 = 33 → pads to 35.
    const cells = buildMonthGrid(2024, 1)
    expect(cells.length).toBe(35)
    // Confirm leap-day is present and correctly formatted.
    expect(cells[4]).toEqual({ day: 1, dateStr: '2024-02-01' })
    expect(cells[32]).toEqual({ day: 29, dateStr: '2024-02-29' })
    expect(cells[33]).toBeNull()
  })

  it('pads December cleanly (no overlap into January)', () => {
    // Dec 2023: 1st is a Friday → 5 leading blanks.
    // 31 days. Total: 5 + 31 = 36 → pads to 42.
    const cells = buildMonthGrid(2023, 11)
    expect(cells.length).toBe(42)
    // Day 31 is there, and we don't accidentally roll into Jan 1.
    expect(cells[35]).toEqual({ day: 31, dateStr: '2023-12-31' })
    // Trailing cells are null, not "Jan 1 2024."
    expect(cells[36]).toBeNull()
    expect(cells[41]).toBeNull()
  })

  it('zero-pads single-digit months and days in dateStr', () => {
    // March 2024, day 5 — both single-digit in the input but
    // double-digit in the YYYY-MM-DD output.
    const cells = buildMonthGrid(2024, 2)
    // March 1 2024 = Friday → 5 leading blanks → day 5 is at
    // index 5 + 4 = 9.
    expect(cells[9]).toEqual({ day: 5, dateStr: '2024-03-05' })
  })
})
