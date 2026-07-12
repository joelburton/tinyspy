import { describe, expect, it } from 'vitest'
import { lengthScore, letterCount, compareCompetitors, type Competitor } from './scoring'

describe('lengthScore', () => {
  it('is round(100 * longest / maxLen)', () => {
    expect(lengthScore(7, 9)).toBe(78) // 77.78 → 78
    expect(lengthScore(6, 9)).toBe(67)
  })
  it('is 100 at (or above) the max, clamped', () => {
    expect(lengthScore(9, 9)).toBe(100)
    expect(lengthScore(12, 10)).toBe(100) // clamp — a longer-than-possible guess
  })
  it('is 0 when there are no guesses or a degenerate board', () => {
    expect(lengthScore(0, 9)).toBe(0)
    expect(lengthScore(5, 0)).toBe(0)
  })
})

describe('letterCount', () => {
  it('sums the guess lengths', () => {
    expect(letterCount([])).toBe(0)
    expect(letterCount([5, 5, 6, 7])).toBe(23)
  })
})

describe('compareCompetitors (leader-first, matches _finish_compete)', () => {
  const c = (length_score: number, letter_count: number, finished_at: string | null): Competitor => ({
    length_score,
    letter_count,
    finished_at,
  })

  it('ranks higher length score first', () => {
    expect(compareCompetitors(c(80, 10, null), c(50, 99, null), false)).toBeLessThan(0)
    expect(compareCompetitors(c(50, 99, null), c(80, 10, null), false)).toBeGreaterThan(0)
  })

  it('breaks a length-score tie on higher letter count', () => {
    expect(compareCompetitors(c(50, 30, null), c(50, 20, null), false)).toBeLessThan(0)
  })

  it('breaks a length+letter tie on earlier finish ONLY when timed', () => {
    const early = c(50, 20, '2026-07-12T00:00:01Z')
    const late = c(50, 20, '2026-07-12T00:00:09Z')
    expect(compareCompetitors(early, late, true)).toBeLessThan(0) // earlier wins
    expect(compareCompetitors(early, late, false)).toBe(0) // untimed → co-leaders
  })

  it('sorts a field leader-first', () => {
    const field = [c(40, 10, null), c(90, 5, null), c(90, 20, null)]
    const sorted = [...field].sort((a, b) => compareCompetitors(a, b, false))
    expect(sorted.map((x) => [x.length_score, x.letter_count])).toEqual([
      [90, 20],
      [90, 5],
      [40, 10],
    ])
  })
})
