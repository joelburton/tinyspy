import { describe, expect, it } from 'vitest'
import { generateBoard, mulberry32, rollBoard } from './generate'
import { DICE_BY_NAME } from './dice'
import { buildTrie } from './solver'
import { boggleSolverFixture as fixture } from './solver.fixture'

const set4 = DICE_BY_NAME['4']
const trie = buildTrie(fixture.dict)

describe('mulberry32', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const a = Array.from({ length: 5 }, mulberry32(1))
    const b = Array.from({ length: 5 }, mulberry32(1))
    const c = Array.from({ length: 5 }, mulberry32(2))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true)
  })
})

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
