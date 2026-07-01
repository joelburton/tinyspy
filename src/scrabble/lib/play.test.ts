import { describe, expect, it } from 'vitest'
import { cellIndex, type Cell } from './board'
import { boardUpToSeq, evaluatePlay, tilesUsed, type Placement } from './play'

const emptyBoard = (): Cell[] => Array(225).fill(null)

/** A board with the given letter tiles already placed (none from blanks). */
function withTiles(tiles: Array<[number, number, string]>): Cell[] {
  const b = emptyBoard()
  for (const [x, y, l] of tiles) b[cellIndex(x, y)] = { l, b: false }
  return b
}

const at = (x: number, y: number, letter: string, blank = false): Placement => ({
  x,
  y,
  letter,
  blank,
})

/** Convenience: the words a (presumed-valid) play forms, as a sorted set. */
function wordsOf(board: Cell[], placements: Placement[]): string[] {
  const r = evaluatePlay(board, placements)
  if (!r.valid) throw new Error(`expected valid, got: ${r.error}`)
  return r.words.map((w) => w.word).sort()
}

describe('opening-play geometry', () => {
  it('rejects a first play that misses the center', () => {
    const r = evaluatePlay(emptyBoard(), [at(0, 0, 'C'), at(1, 0, 'A')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('center') })
  })

  it('rejects a single-tile first play', () => {
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'A')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('2 tiles') })
  })

  it('accepts CAT across the center and doubles it on the star', () => {
    // C(6,7) A(7,7=DW) T(8,7): 3+1+1 = 5, ×2 (center) = 10
    const r = evaluatePlay(emptyBoard(), [
      at(6, 7, 'C'),
      at(7, 7, 'A'),
      at(8, 7, 'T'),
    ])
    expect(r).toEqual({
      valid: true,
      bingo: false,
      score: 10,
      words: [expect.objectContaining({ word: 'CAT', score: 10 })],
    })
  })
})

describe('placement-shape geometry', () => {
  it('rejects a diagonal play', () => {
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'A'), at(8, 8, 'B')])
    expect(r).toEqual({
      valid: false,
      error: expect.stringContaining('single row or column'),
    })
  })

  it('rejects a gap in the line of play', () => {
    // Mid-game board with a lone A; placing at 4 and 6 leaves 5 empty.
    const r = evaluatePlay(withTiles([[7, 7, 'A']]), [at(4, 7, 'X'), at(6, 7, 'Y')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('gaps') })
  })

  it('rejects a play that does not connect to existing tiles', () => {
    const r = evaluatePlay(withTiles([[7, 7, 'A']]), [at(0, 0, 'X'), at(1, 0, 'Y')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('connect') })
  })

  it('overlapping an existing tile is rejected', () => {
    const r = evaluatePlay(withTiles([[7, 7, 'A']]), [at(7, 7, 'B')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('overlaps') })
  })
})

describe('word extraction', () => {
  it('reads the main word plus every cross-word', () => {
    // Board: C(6,7) A(7,7) T(8,7). Play O(6,8) S(7,8) along row 8:
    //   main "OS", cross "CO" (col 6), cross "AS" (col 7).
    const board = withTiles([
      [6, 7, 'C'],
      [7, 7, 'A'],
      [8, 7, 'T'],
    ])
    expect(wordsOf(board, [at(6, 8, 'O'), at(7, 8, 'S')])).toEqual(['AS', 'CO', 'OS'])
  })

  it('finds a single perpendicular cross-word off a one-tile play', () => {
    // Board CAT row 7; drop O under the T(8,7) → vertical "TO" only.
    const board = withTiles([
      [6, 7, 'C'],
      [7, 7, 'A'],
      [8, 7, 'T'],
    ])
    expect(wordsOf(board, [at(8, 8, 'O')])).toEqual(['TO'])
  })
})

describe('scoring', () => {
  it('applies new-tile premiums to every word the tile joins', () => {
    // Same OS/CO/AS play. O lands on a double-letter (8,8 layout → (6,8)=DL).
    //   OS: O(×2)=2 + S=1            = 3
    //   CO: C=3      + O(×2)=2        = 5
    //   AS: A=1      + S=1            = 2
    //   total 10
    const board = withTiles([
      [6, 7, 'C'],
      [7, 7, 'A'],
      [8, 7, 'T'],
    ])
    const r = evaluatePlay(board, [at(6, 8, 'O'), at(7, 8, 'S')])
    expect(r).toMatchObject({ valid: true, score: 10 })
  })

  it('scores a blank as 0 even on a premium square', () => {
    // Blank-as-Q on the center DW + I(8,7): (0 + 1) × 2 = 2.
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'Q', true), at(8, 7, 'I')])
    expect(r).toMatchObject({ valid: true, score: 2 })
    expect(wordsOf(emptyBoard(), [at(7, 7, 'Q', true), at(8, 7, 'I')])).toEqual(['QI'])
  })

  it('adds the +50 bingo for using all 7 tiles', () => {
    // 7 E's across row 7 (cols 4..10); only the center DW applies.
    //   7 × 1 = 7, ×2 (center) = 14, + 50 bingo = 64
    const placements = [4, 5, 6, 7, 8, 9, 10].map((x) => at(x, 7, 'E'))
    const r = evaluatePlay(emptyBoard(), placements)
    expect(r).toMatchObject({ valid: true, bingo: true, score: 64 })
  })
})

describe('tilesUsed', () => {
  it('maps blanks to ? and keeps letters otherwise', () => {
    expect(tilesUsed([at(7, 7, 'Q', true), at(8, 7, 'I')])).toEqual(['?', 'I'])
  })
})

describe('boardUpToSeq (turn-viewer replay)', () => {
  const plays = [
    { seq: 1, kind: 'word', placements: [at(7, 7, 'C'), at(8, 7, 'A'), at(9, 7, 'T')] },
    { seq: 2, kind: 'pass', placements: null },
    { seq: 3, kind: 'word', placements: [at(8, 8, 'B'), at(8, 9, 'E')] }, // off the A, downward
    { seq: 4, kind: 'exchange', placements: null },
  ]

  it('replays only word plays up to and including the given seq', () => {
    const b1 = boardUpToSeq(plays, 1)
    expect(b1[cellIndex(7, 7)]).toEqual({ l: 'C', b: false })
    expect(b1[cellIndex(9, 7)]).toEqual({ l: 'T', b: false })
    expect(b1[cellIndex(8, 8)]).toBeNull() // turn 3 not applied yet
  })

  it('a pass/exchange turn shows the board as of the prior word play (no new tiles)', () => {
    expect(boardUpToSeq(plays, 2)).toEqual(boardUpToSeq(plays, 1)) // pass adds nothing
    expect(boardUpToSeq(plays, 4)).toEqual(boardUpToSeq(plays, 3)) // exchange adds nothing
  })

  it('includes every earlier word play by the latest seq', () => {
    const b = boardUpToSeq(plays, 3)
    expect(b[cellIndex(7, 7)]).toEqual({ l: 'C', b: false }) // turn 1
    expect(b[cellIndex(8, 9)]).toEqual({ l: 'E', b: false }) // turn 3
  })

  it('preserves a blank tile declared letter + flag', () => {
    const withBlank = [{ seq: 1, kind: 'word', placements: [at(7, 7, 'M', true)] }]
    expect(boardUpToSeq(withBlank, 1)[cellIndex(7, 7)]).toEqual({ l: 'M', b: true })
  })
})
