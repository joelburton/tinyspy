// cs-unmet

import { describe, expect, it } from 'vitest'
import { generateBoard, rollBoard } from './generate'
import { mulberry32 } from '../../common/lib/util/mulberry32'
import { DICE_BY_NAME } from './dice'
import { buildTrie } from './solver'
import { boggleSolverFixture as fixture } from './solver.fixture'

const set4 = DICE_BY_NAME['4']
const trie = buildTrie(fixture.dict)

// The `describe('mulberry32')` block that used to sit here moved to
// src/common/lib/util/mulberry32.test.ts along with the function itself: it was
// the only test of a generator three games now share, so it belongs beside the
// shared copy rather than in one game's suite.

describe('rollBoard', () => {
  it('produces an n²-length board of valid faces, deterministic per seed', () => {
    const b1 = rollBoard(set4, mulberry32(42))
    const b2 = rollBoard(set4, mulberry32(42))
    expect(b1).toBe(b2)
    expect(b1.length).toBe(16)
    expect(b1).toMatch(/^[A-Z0-6]{16}$/)
  })
})

describe('generateBoard', () => {
  it('returns a board whose required words cross-check, and is reproducible', () => {
    const g = generateBoard(trie, set4, { minWords: 5 }, 7)!
    expect(g).not.toBeNull()
    expect(g.board.length).toBe(16)
    expect(g.count).toBeGreaterThanOrEqual(5)
    // requiredWords must agree with the reported stats
    expect(g.requiredWords.length).toBe(g.count)
    expect(g.requiredWords.reduce((m, w) => Math.max(m, w.word.length), 0)).toBe(g.longest)
    expect(g.requiredWords.reduce((s, w) => s + w.points, 0)).toBe(g.score)
    // same seed → identical board
    expect(generateBoard(trie, set4, { minWords: 5 }, 7)!.board).toBe(g.board)
  })

  it('honors a minLongest constraint', () => {
    const g = generateBoard(trie, set4, { minLongest: 6 }, 3)
    expect(g).not.toBeNull()
    expect(g!.longest).toBeGreaterThanOrEqual(6)
  })

  it('returns null when constraints cannot be met within maxTries', () => {
    expect(generateBoard(trie, set4, { minWords: 100_000 }, 1, 50)).toBeNull()
  })
})
