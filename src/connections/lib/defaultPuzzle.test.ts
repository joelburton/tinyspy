import { describe, expect, it } from 'vitest'
import { resolveDefaultPuzzle } from './defaultPuzzle'

// Date-DESCENDING, like the list SetupForm holds (index 0 = most recent).
const PUZZLES = [
  { id: 'p5', nyt_date: '2024-01-05' },
  { id: 'p4', nyt_date: '2024-01-04' },
  { id: 'p3', nyt_date: '2024-01-03' },
  { id: 'p2', nyt_date: '2024-01-02' },
  { id: 'p1', nyt_date: '2024-01-01' },
]

describe('resolveDefaultPuzzle', () => {
  it('returns null when there are no puzzles', () => {
    expect(resolveDefaultPuzzle([], new Set(), 'p3')).toBeNull()
  })

  it('defaults to the saved-default puzzle when it is unplayed', () => {
    expect(resolveDefaultPuzzle(PUZZLES, new Set(), 'p3')).toBe('p3')
  })

  it('defaults to the most-recent puzzle when there is no saved default', () => {
    expect(resolveDefaultPuzzle(PUZZLES, new Set(), '')).toBe('p5')
  })

  it('falls back to most-recent when the saved id is not in the list', () => {
    // e.g. the saved puzzle has aged out of the import window.
    expect(resolveDefaultPuzzle(PUZZLES, new Set(), 'gone')).toBe('p5')
  })

  it('steps one day forward when the saved-default puzzle is finished', () => {
    // Club finished p3 (2024-01-03) → default to the next day, p4.
    expect(resolveDefaultPuzzle(PUZZLES, new Set(['2024-01-03']), 'p3')).toBe('p4')
  })

  it('steps only ONE day even if the next day is also finished', () => {
    // Both p3 and p4 finished → still land on p4, not skip to p5.
    const finished = new Set(['2024-01-03', '2024-01-04'])
    expect(resolveDefaultPuzzle(PUZZLES, finished, 'p3')).toBe('p4')
  })

  it('does not step forward for an in-progress (non-finished) base puzzle', () => {
    // p3 is active, not terminal → it is NOT in finishedDates → resume it.
    expect(resolveDefaultPuzzle(PUZZLES, new Set(), 'p3')).toBe('p3')
  })

  it('stays put when the finished base puzzle is already the most recent', () => {
    // p5 is the newest import and it's finished — no next day exists.
    expect(resolveDefaultPuzzle(PUZZLES, new Set(['2024-01-05']), 'p5')).toBe('p5')
  })

  it('picks the CLOSEST next day, not just any later date', () => {
    // Finished p2 (2024-01-02); later dates are 03/04/05 — the step must be
    // to 03 (p3), the nearest, not to the front-of-list most-recent.
    expect(resolveDefaultPuzzle(PUZZLES, new Set(['2024-01-02']), 'p2')).toBe('p3')
  })

  it('handles a gap in the archive by stepping to the next AVAILABLE day', () => {
    // No puzzle imported for 2024-01-04; finishing p3 steps to p5 (the next
    // date that actually exists), since 01-04 can't be defaulted to.
    const gapped = [
      { id: 'p5', nyt_date: '2024-01-05' },
      { id: 'p3', nyt_date: '2024-01-03' },
      { id: 'p2', nyt_date: '2024-01-02' },
    ]
    expect(resolveDefaultPuzzle(gapped, new Set(['2024-01-03']), 'p3')).toBe('p5')
  })
})
