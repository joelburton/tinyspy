import { describe, expect, it } from 'vitest'
import { assembleSolution, minSwaps } from '../../../src/waffle/lib/puzzle'
import { FILLED } from '../../../src/waffle/lib/waffle'
import {
  ANCHORS,
  GREENS_MAX,
  GREENS_MIN,
  makeScramble,
  PAR_MAX,
  PAR_MIN,
} from './waffleGen'

// A consistent all-distinct-letter solution (same one the puzzle tests
// use). makeScramble is randomised, so we sample many boards and assert
// the invariants hold on every one.
const SOLUTION = assembleSolution([
  'abcde',
  'ijklm',
  'qrstu',
  'afinq',
  'cgkos',
  'ehmpu',
])

describe('makeScramble (real-Waffle conventions)', () => {
  it('locks the corners + center green and keeps 5–8 total greens', () => {
    for (let i = 0; i < 200; i++) {
      const sc = makeScramble(SOLUTION)
      expect(sc).not.toBeNull()
      const { scramble, par } = sc!

      // Every anchor stays in its solved spot (green).
      for (const c of ANCHORS) expect(scramble[c]).toBe(SOLUTION[c])

      // Total greens land in the convention band.
      const greens = FILLED.filter((c) => scramble[c] === SOLUTION[c]).length
      expect(greens).toBeGreaterThanOrEqual(GREENS_MIN)
      expect(greens).toBeLessThanOrEqual(GREENS_MAX)

      // Stored par is the true minimum and lands in the par band.
      expect(par).toBe(minSwaps(scramble, SOLUTION))
      expect(par).toBeGreaterThanOrEqual(PAR_MIN)
      expect(par).toBeLessThanOrEqual(PAR_MAX)
    }
  })
})
