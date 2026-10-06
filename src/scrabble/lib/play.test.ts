// cs-unmet

import { describe, expect, it } from 'vitest'
import { cellIndex, makeCellId, makeEmptyBoard } from './board'
import { historyBoard, evaluatePlay, tilesUsed } from './play'
import type { GCell, GPlacement, GTile } from '../types'

const emptyBoard = makeEmptyBoard

/** A board with the given letter tiles already placed (none from blanks). */
function withTiles(tiles: Array<[number, number, string]>): GCell[] {
  const b = emptyBoard()
  for (const [x, y, letter] of tiles) b[cellIndex(x, y)] = { id: makeCellId(x, y), tile: tileAt(x, y, letter) }
  return b
}

const at = (x: number, y: number, letter: string, blank = false): GPlacement => ({
  x,
  y,
  letter,
  blank,
})

/** A placed tile, as a word's placement in the log carries it. */
function tileAt(x: number, y: number, letter: string, blank = false): GTile {
  return { id: makeCellId(x, y), letter, blank }
}

/** Convenience: the words a (presumed-valid) play forms, as a sorted set. */
function wordsOf(board: GCell[], placements: GPlacement[]): string[] {
  const r = evaluatePlay(board, placements)
  if (!r.valid) throw new Error(`expected valid, got: ${r.error}`)
  return r.words.map((w) => w.word).sort()
}

describe('opening-play geometry', () => {
  it('rejects a first play that misses the center', () => {
    const r = evaluatePlay(emptyBoard(), [at(0, 0, 'c'), at(1, 0, 'a')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('center') })
  })

  it('rejects a single-tile first play', () => {
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'a')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('2 tiles') })
  })

  it('accepts CAT across the center and doubles it on the star', () => {
    // C(6,7) A(7,7=DW) T(8,7): 3+1+1 = 5, ×2 (center) = 10
    const r = evaluatePlay(emptyBoard(), [
      at(6, 7, 'c'),
      at(7, 7, 'a'),
      at(8, 7, 't'),
    ])
    expect(r).toEqual({
      valid: true,
      bingo: false,
      score: 10,
      words: [expect.objectContaining({ word: 'cat', score: 10 })],
    })
  })
})

describe('placement-shape geometry', () => {
  it('rejects a diagonal play', () => {
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'a'), at(8, 8, 'b')])
    expect(r).toEqual({
      valid: false,
      error: expect.stringContaining('single row or column'),
    })
  })

  it('rejects a gap in the line of play', () => {
    // Mid-game board with a lone A; placing at 4 and 6 leaves 5 empty.
    const r = evaluatePlay(withTiles([[7, 7, 'a']]), [at(4, 7, 'x'), at(6, 7, 'y')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('gaps') })
  })

  it('rejects a play that does not connect to existing tiles', () => {
    const r = evaluatePlay(withTiles([[7, 7, 'a']]), [at(0, 0, 'x'), at(1, 0, 'y')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('connect') })
  })

  it('overlapping an existing tile is rejected', () => {
    const r = evaluatePlay(withTiles([[7, 7, 'a']]), [at(7, 7, 'b')])
    expect(r).toEqual({ valid: false, error: expect.stringContaining('overlaps') })
  })
})

describe('word extraction', () => {
  it('reads the main word plus every cross-word', () => {
    // Board: C(6,7) A(7,7) T(8,7). Play O(6,8) S(7,8) along row 8:
    //   main "OS", cross "CO" (col 6), cross "AS" (col 7).
    const board = withTiles([
      [6, 7, 'c'],
      [7, 7, 'a'],
      [8, 7, 't'],
    ])
    expect(wordsOf(board, [at(6, 8, 'o'), at(7, 8, 's')])).toEqual(['as', 'co', 'os'])
  })

  it('finds a single perpendicular cross-word off a one-tile play', () => {
    // Board CAT row 7; drop O under the T(8,7) → vertical "TO" only.
    const board = withTiles([
      [6, 7, 'c'],
      [7, 7, 'a'],
      [8, 7, 't'],
    ])
    expect(wordsOf(board, [at(8, 8, 'o')])).toEqual(['to'])
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
      [6, 7, 'c'],
      [7, 7, 'a'],
      [8, 7, 't'],
    ])
    const r = evaluatePlay(board, [at(6, 8, 'o'), at(7, 8, 's')])
    expect(r).toMatchObject({ valid: true, score: 10 })
  })

  it('scores a blank as 0 even on a premium cell', () => {
    // Blank-as-Q on the center DW + I(8,7): (0 + 1) × 2 = 2.
    const r = evaluatePlay(emptyBoard(), [at(7, 7, 'q', true), at(8, 7, 'i')])
    expect(r).toMatchObject({ valid: true, score: 2 })
    expect(wordsOf(emptyBoard(), [at(7, 7, 'q', true), at(8, 7, 'i')])).toEqual(['qi'])
  })

  it('adds the +50 bingo for using all 7 tiles', () => {
    // 7 E's across row 7 (cols 4..10); only the center DW applies.
    //   7 × 1 = 7, ×2 (center) = 14, + 50 bingo = 64
    const placements = [4, 5, 6, 7, 8, 9, 10].map((x) => at(x, 7, 'e'))
    const r = evaluatePlay(emptyBoard(), placements)
    expect(r).toMatchObject({ valid: true, bingo: true, score: 64 })
  })
})

describe('tilesUsed', () => {
  it('maps blanks to ? and keeps letters otherwise', () => {
    expect(tilesUsed([at(7, 7, 'q', true), at(8, 7, 'i')])).toEqual(['?', 'i'])
  })
})

describe('historyBoard (turn-viewer replay)', () => {
  const events = [
    { id: 1, kind: 'word', placements: [tileAt(7, 7, 'c'), tileAt(8, 7, 'a'), tileAt(9, 7, 't')] },
    { id: 2, kind: 'pass', placements: null },
    { id: 3, kind: 'word', placements: [tileAt(8, 8, 'b'), tileAt(8, 9, 'e')] }, // off the A, downward
    { id: 4, kind: 'exchange', placements: null },
  ]

  it('replays only word plays up to and including the given row', () => {
    const b1 = historyBoard(events, 1)
    expect(b1[cellIndex(7, 7)].tile).toEqual(tileAt(7, 7, 'c', false))
    expect(b1[cellIndex(9, 7)].tile).toEqual(tileAt(9, 7, 't', false))
    expect(b1[cellIndex(8, 8)].tile).toBeNull() // turn 3 not applied yet
  })

  it('a pass/exchange turn shows the board as of the prior word play (no new tiles)', () => {
    expect(historyBoard(events, 2)).toEqual(historyBoard(events, 1)) // pass adds nothing
    expect(historyBoard(events, 4)).toEqual(historyBoard(events, 3)) // exchange adds nothing
  })

  it('includes every earlier word play by the row being viewed', () => {
    const b = historyBoard(events, 3)
    expect(b[cellIndex(7, 7)].tile).toEqual(tileAt(7, 7, 'c', false)) // turn 1
    expect(b[cellIndex(8, 9)].tile).toEqual(tileAt(8, 9, 'e', false)) // turn 3
  })

  it('preserves a blank tile declared letter + flag', () => {
    const withBlank = [{ id: 1, kind: 'word', placements: [tileAt(7, 7, 'm', true)] }]
    expect(historyBoard(withBlank, 1)[cellIndex(7, 7)].tile).toEqual(tileAt(7, 7, 'm', true))
  })
})
