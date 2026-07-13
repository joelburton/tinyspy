import { describe, expect, it } from 'vitest'
import {
  currentRankIndex,
  GENIUS_AT,
  rankPoints,
  RANKS,
  rankThreshold,
} from './rankLadder'

describe('RANKS', () => {
  it('has 7 entries in the expected order', () => {
    expect(RANKS).toEqual([
      'Start',
      'Good',
      'Solid',
      'Nice',
      'Great',
      'Amazing',
      'Genius',
    ])
  })

  it('GENIUS_AT is 70% — the NYT-canonical Genius threshold', () => {
    expect(GENIUS_AT).toBe(0.7)
  })
})

describe('rankThreshold', () => {
  it('Start = 0', () => {
    expect(rankThreshold(0)).toBe(0)
  })

  it('Genius = GENIUS_AT (0.7)', () => {
    expect(rankThreshold(6)).toBeCloseTo(0.7, 10)
  })

  it('linearly interpolates between Start and Genius', () => {
    // Index 3 = "Nice", halfway up the ladder, so half of GENIUS_AT.
    expect(rankThreshold(3)).toBeCloseTo(GENIUS_AT / 2, 10)
  })

  it('every rank above the previous one is strictly higher', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(rankThreshold(i)).toBeGreaterThan(rankThreshold(i - 1))
    }
  })
})

describe('rankPoints', () => {
  it('Start is always 0 points', () => {
    expect(rankPoints(0, 100)).toBe(0)
    expect(rankPoints(0, 50)).toBe(0)
  })

  it('Genius = ceil(0.7 * total)', () => {
    expect(rankPoints(6, 100)).toBe(70)
    // 0.7 * 50 = 35 exact (no ceil rounding)
    expect(rankPoints(6, 50)).toBe(35)
    // 0.7 * 33 = 23.1 → ceil → 24
    expect(rankPoints(6, 33)).toBe(24)
  })

  it('handles total=0 without dividing by zero', () => {
    // Threshold * 0 = 0; ceil(0) = 0 across all ranks.
    expect(rankPoints(3, 0)).toBe(0)
    expect(rankPoints(6, 0)).toBe(0)
  })

  it('does not overshoot the real Amazing threshold (float-ceil regression)', () => {
    // (5/6)*0.7*108 is mathematically exactly 63, but IEEE-754 yields
    // 63.00000000000001, so a naive Math.ceil(rankThreshold(i)*total) returns
    // 64 — one point ABOVE where the bar fills Amazing and the compete race is
    // actually won (both integer-based). The displayed "needs N" must be that
    // real integer unlock point.
    expect(rankPoints(5, 108)).toBe(63)
  })

  it('the displayed threshold is the real integer unlock point for every rank/total', () => {
    // The "needs N points" label must be the MINIMAL score at which the rank is
    // actually awarded — i.e. it must agree with the integer win-check each
    // game's `_rank_idx` runs: least(6, (score*60)/(total*7)). This is the
    // "keep the two implementations in lockstep" invariant from rankLadder.ts,
    // applied to the display. A float-drifted rankPoints breaks it (34 totals in
    // 1..2000, all at Amazing).
    const sqlIdx = (s: number, t: number) =>
      t ? Math.min(6, Math.floor((s * 60) / (t * 7))) : 0
    const drifted: Array<{ total: number; rank: number; pts: number }> = []
    for (let total = 1; total <= 2000; total++) {
      for (let rank = 1; rank <= 6; rank++) {
        const pts = rankPoints(rank, total)
        // `pts` reaches the rank, and one point below it does NOT (so it's minimal).
        if (sqlIdx(pts, total) < rank || (pts > 0 && sqlIdx(pts - 1, total) >= rank)) {
          drifted.push({ total, rank, pts })
        }
      }
    }
    expect(drifted).toEqual([])
  })
})

describe('currentRankIndex', () => {
  it('returns 0 when total is 0 (no puzzle, no rank)', () => {
    expect(currentRankIndex(0, 0)).toBe(0)
    expect(currentRankIndex(100, 0)).toBe(0)
  })

  it('returns 0 (Start) for a score of zero on a non-trivial puzzle', () => {
    expect(currentRankIndex(0, 100)).toBe(0)
  })

  it('returns 6 (Genius) at exactly the GENIUS_AT threshold', () => {
    // total=50, GENIUS_AT*50 = 35 — at-or-above unlocks Genius.
    expect(currentRankIndex(35, 50)).toBe(6)
    expect(currentRankIndex(34, 50)).toBeLessThan(6)
  })

  it('clamps at Genius for scores beyond GENIUS_AT', () => {
    // Full clear = score == total > GENIUS_AT * total.
    expect(currentRankIndex(50, 50)).toBe(6)
    // 200% of GENIUS_AT still maxes at index 6.
    expect(currentRankIndex(100, 50)).toBe(6)
  })

  it('walks the ladder in order as score climbs (total=50)', () => {
    // total=50 yields neat thresholds: Good=6, Solid=12, Nice=18,
    // Great=24, Amazing=30, Genius=35 (these match the values
    // used in the gameplay pgTAP test).
    expect(currentRankIndex(0, 50)).toBe(0)   // Start
    expect(currentRankIndex(6, 50)).toBe(1)   // Good
    expect(currentRankIndex(12, 50)).toBe(2)  // Solid
    expect(currentRankIndex(18, 50)).toBe(3)  // Nice
    expect(currentRankIndex(24, 50)).toBe(4)  // Great
    expect(currentRankIndex(30, 50)).toBe(5)  // Amazing
    expect(currentRankIndex(35, 50)).toBe(6)  // Genius
  })

  it('one below each threshold stays at the previous rank', () => {
    // The complement of the climb test — just-under-threshold
    // stays at the lower rank. (Genius is open-ended above so
    // no "just over" stay-down case.)
    expect(currentRankIndex(5, 50)).toBe(0)
    expect(currentRankIndex(11, 50)).toBe(1)
    expect(currentRankIndex(17, 50)).toBe(2)
    expect(currentRankIndex(23, 50)).toBe(3)
    expect(currentRankIndex(29, 50)).toBe(4)
    expect(currentRankIndex(34, 50)).toBe(5)
  })

  it('agrees with the integer-math formula used by each game\'s _rank_idx', () => {
    // The SQL helper computes:
    //   least(6, (score * 60) / (total * 7))   -- integer division
    // For every value of total ∈ {50, 100} and score ∈ [0, total]
    // the TS function and SQL formula must produce the same idx.
    for (const total of [50, 100]) {
      for (let score = 0; score <= total; score++) {
        const sqlIdx = Math.min(6, Math.floor((score * 60) / (total * 7)))
        expect(currentRankIndex(score, total)).toBe(sqlIdx)
      }
    }
  })
})
