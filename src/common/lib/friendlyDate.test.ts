import { describe, expect, it } from 'vitest'
import { friendlyDate } from './friendlyDate'

/* Anchor `now` to a midweek afternoon in 2026 so the tier
 * boundaries are unambiguous (mid-week so we have room for
 * "2 days ago = a weekday" + "5 days ago = same week").
 *
 *   2026-06-17 (Wednesday) 14:30 local time
 */
const NOW = new Date(2026, 5, 17, 14, 30) // months are 0-indexed

/** Build a Date by subtracting milliseconds from NOW — convenient
 *  for "X minutes/hours/days ago" assertions without re-deriving
 *  the absolute date each time. */
function ago(ms: number) {
  return new Date(NOW.getTime() - ms).toISOString()
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('friendlyDate', () => {
  it('Just now for sub-minute deltas', () => {
    expect(friendlyDate(ago(0), NOW)).toBe('Just now')
    expect(friendlyDate(ago(30 * 1000), NOW)).toBe('Just now')
    expect(friendlyDate(ago(59 * 1000), NOW)).toBe('Just now')
  })

  it('treats clock-skew future stamps as Just now', () => {
    // Client clock running fast vs the server's timestamp.
    const future = new Date(NOW.getTime() + 30 * 1000).toISOString()
    expect(friendlyDate(future, NOW)).toBe('Just now')
  })

  it('N min ago for 1–59 minute deltas', () => {
    expect(friendlyDate(ago(MIN), NOW)).toBe('1 min ago')
    expect(friendlyDate(ago(5 * MIN), NOW)).toBe('5 min ago')
    expect(friendlyDate(ago(59 * MIN), NOW)).toBe('59 min ago')
  })

  it('Today H[:MM]pm for same-day ≥ 1 hour deltas', () => {
    // NOW is 14:30; 4 hours ago = 10:30am.
    expect(friendlyDate(ago(4 * HOUR), NOW)).toBe('Today 10:30am')
    // 2 hours 30 min ago = 12:00pm — on the hour, no minutes.
    expect(friendlyDate(ago(2.5 * HOUR), NOW)).toBe('Today 12pm')
  })

  it('Yesterday H[:MM]pm for calendar-day-1 deltas', () => {
    // 2026-06-16 (Tue) 9pm = 17.5 hours before NOW.
    const stamp = new Date(2026, 5, 16, 21, 0).toISOString()
    expect(friendlyDate(stamp, NOW)).toBe('Yesterday 9pm')
  })

  it('uses calendar-day diff, not raw 24h windows', () => {
    // 2026-06-16 11pm: calendar-yesterday, but only ~15.5h ago.
    // The 24h-window approach would say "Today 11pm" (it's
    // within 24 hours), which is wrong — the user knows they're
    // in a new day.
    const stamp = new Date(2026, 5, 16, 23, 0).toISOString()
    expect(friendlyDate(stamp, NOW)).toBe('Yesterday 11pm')
  })

  it('Day H[:MM]pm for 2–6 calendar days ago', () => {
    // 2026-06-14 (Sun) at 10:15am — 3 days ago.
    const stamp = new Date(2026, 5, 14, 10, 15).toISOString()
    expect(friendlyDate(stamp, NOW)).toBe('Sun 10:15am')

    // 2026-06-11 (Thu) at 4pm — 6 days ago.
    const stamp2 = new Date(2026, 5, 11, 16, 0).toISOString()
    expect(friendlyDate(stamp2, NOW)).toBe('Thu 4pm')
  })

  it('month day for older than a week, same year', () => {
    // 2026-03-12 at 2:14pm.
    const stamp = new Date(2026, 2, 12, 14, 14).toISOString()
    expect(friendlyDate(stamp, NOW)).toBe('Mar 12')
  })

  it('month day, year for different year', () => {
    // 2025-03-12 at 9am.
    const stamp = new Date(2025, 2, 12, 9, 0).toISOString()
    expect(friendlyDate(stamp, NOW)).toBe('Mar 12, 2025')
  })

  it('treats the exact 7-day boundary as old enough for a date', () => {
    // Exactly 7 days before NOW: 2026-06-10 at 14:30.
    const stamp = new Date(2026, 5, 10, 14, 30).toISOString()
    // 7 days ago is outside the 2–6-day "Day H:MMpm" bucket;
    // falls through to the date format.
    expect(friendlyDate(stamp, NOW)).toBe('Jun 10')
  })
})
