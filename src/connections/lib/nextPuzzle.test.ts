import { describe, it, expect } from 'vitest'
import { nextUnplayedPuzzle } from './nextPuzzle'

// ASCENDING by date — the order PlayArea queries them in.
const PUZZLES = [
  { id: 'p1', nyt_date: '2024-01-01' },
  { id: 'p2', nyt_date: '2024-01-02' },
  { id: 'p3', nyt_date: '2024-01-03' },
  { id: 'p4', nyt_date: '2024-01-04' },
]

describe('nextUnplayedPuzzle', () => {
  it('walks forward from the current game to the next unplayed date', () => {
    expect(nextUnplayedPuzzle(PUZZLES, new Set(), '2024-01-02')?.id).toBe('p3')
  })

  it('skips dates the club has already played', () => {
    // p2 is next by date but already played → p3.
    const played = new Set(['2024-01-02'])
    expect(nextUnplayedPuzzle(PUZZLES, played, '2024-01-01')?.id).toBe('p3')
  })

  it('skips a RUN of played dates, not just one', () => {
    const played = new Set(['2024-01-02', '2024-01-03'])
    expect(nextUnplayedPuzzle(PUZZLES, played, '2024-01-01')?.id).toBe('p4')
  })

  it('never walks BACKWARD, even when earlier dates are unplayed', () => {
    // p1/p2 are unplayed but behind us — the group moves forward.
    expect(nextUnplayedPuzzle(PUZZLES, new Set(), '2024-01-03')?.id).toBe('p4')
  })

  it('returns null at the end of the archive', () => {
    expect(nextUnplayedPuzzle(PUZZLES, new Set(), '2024-01-04')).toBeNull()
  })

  it('returns null when every later puzzle is already played', () => {
    const played = new Set(['2024-01-03', '2024-01-04'])
    expect(nextUnplayedPuzzle(PUZZLES, played, '2024-01-02')).toBeNull()
  })

  it('falls back to the earliest unplayed puzzle when the game has no date', () => {
    // A non-NYT puzzle has no place in the archive, so there's nothing to walk
    // forward FROM — start from the beginning, skipping what's been played.
    const played = new Set(['2024-01-01'])
    expect(nextUnplayedPuzzle(PUZZLES, played, null)?.id).toBe('p2')
  })

  it('returns null for an empty archive', () => {
    expect(nextUnplayedPuzzle([], new Set(), null)).toBeNull()
  })
})
