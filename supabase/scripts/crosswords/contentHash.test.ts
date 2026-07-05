import { describe, expect, it } from 'vitest'
import { parseIpuzBuffer } from './ipuz'
import { puzzleContentHash } from './contentHash'

function ipuzOf(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8')
}

const BASE = {
  version: 'http://ipuz.org/v2',
  kind: ['http://ipuz.org/crossword#1'],
  title: 'Original',
  author: 'A. Setter',
  dimensions: { width: 3, height: 3 },
  puzzle: [
    [1, 2, 3],
    [4, 0, 0],
    ['#', 5, 0],
  ],
  solution: [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['#', 'G', 'H'],
  ],
  clues: {
    Across: [
      [1, 'first'],
      [4, 'fourth'],
      [5, 'fifth'],
    ],
    Down: [
      [1, 'down 1'],
      [2, 'down 2'],
      [3, 'down 3'],
    ],
  },
}

function hashOf(obj: unknown): string {
  const { state, solution } = parseIpuzBuffer('x', ipuzOf(obj))
  return puzzleContentHash(state, solution)
}

describe('puzzleContentHash', () => {
  it('is deterministic for the same puzzle', () => {
    expect(hashOf(BASE)).toBe(hashOf(structuredClone(BASE)))
  })

  it('ignores cosmetic metadata (title/author) — reprints collide', () => {
    const reprint = structuredClone(BASE)
    reprint.title = 'A Fancy Reprint'
    reprint.author = 'Someone Else'
    expect(hashOf(reprint)).toBe(hashOf(BASE))
  })

  it('changes when the solving content changes (a clue)', () => {
    const edited = structuredClone(BASE)
    edited.clues.Across[0] = [1, 'FIRST (reworded)']
    expect(hashOf(edited)).not.toBe(hashOf(BASE))
  })

  it('changes when the answer grid changes', () => {
    const edited = structuredClone(BASE)
    edited.solution[0]![0] = 'Z'
    expect(hashOf(edited)).not.toBe(hashOf(BASE))
  })

  it('is a 64-char hex SHA-256 digest', () => {
    expect(hashOf(BASE)).toMatch(/^[0-9a-f]{64}$/)
  })
})
