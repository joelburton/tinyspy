// cs-unmet

import { describe, expect, it } from 'vitest'
import { traceableStr, tracePathStr, traceCellsStr } from './boardTrace'
import { buildTrie, listWords, parseBoard } from './solver'
import { boggleSolverFixture as fixture } from './solver.fixture'

describe('boardTrace', () => {
  it('agrees with the solver: every word it finds is traceable', () => {
    // Cross-check against the solver's own enumeration on fixture boards: any
    // word listWords() returns must trace; a couple of non-words must not.
    const trie = buildTrie(fixture.dict)
    const opts = { minWordLength: 3, ladder: 'basic' as const }
    const fails: string[] = []
    for (const c of fixture.cases.slice(0, 12)) {
      for (const { word } of listWords(trie, parseBoard(c.board), opts)) {
        if (!traceableStr(c.board, word)) fails.push(`${c.board}:${word}`)
      }
    }
    expect(fails).toEqual([])
  })

  it('rejects words not on the board', () => {
    // 2×2: C A / T R (all mutually adjacent)
    expect(traceableStr('CATR', 'cat')).toBe(true)
    expect(traceableStr('CATR', 'arc')).toBe(true)
    expect(traceableStr('CATR', 'dog')).toBe(false) // letters not present
    expect(traceableStr('CATR', 'cc')).toBe(false)  // only one C, no reuse
  })

  it('handles multiface (Qu) and blank tiles', () => {
    // 2×2: cell0 = Qu (1), I, T, S
    expect(traceableStr('1ITS', 'quit')).toBe(true)  // Qu→I→T
    expect(traceableStr('1ITS', 'its')).toBe(true)
    // blank (0) tile matches nothing
    expect(traceableStr('CA0T', 'cat')).toBe(true)   // C-A-T, blank unused
    expect(traceableStr('0000', 'cat')).toBe(false)
  })
})

describe('tracePath', () => {
  it('gives the cells a word uses, in order', () => {
    // CATR on one row: C=0, A=1, T=2, R=3.
    expect(tracePathStr('CATR', 'cat')).toEqual([0, 1, 2])
  })

  it('is null for a word the board cannot spell', () => {
    expect(tracePathStr('CATR', 'dog')).toBeNull()
  })

  it('finds a path for every word the solver finds', () => {
    const trie = buildTrie(fixture.dict)
    const opts = { minWordLength: 3, ladder: 'basic' as const }
    const fails: string[] = []
    for (const c of fixture.cases.slice(0, 12)) {
      for (const { word } of listWords(trie, parseBoard(c.board), opts)) {
        if (tracePathStr(c.board, word) === null) fails.push(`${c.board}:${word}`)
      }
    }
    expect(fails).toEqual([])
  })

  it('returns one cell per letter, never reusing a tile', () => {
    const path = tracePathStr('CATR', 'cat')
    expect(path).toHaveLength(3)
    expect(new Set(path)).toHaveLength(3)
  })
})

describe('traceCells', () => {
  // The board Joel drew the rule on, padded out to the 5×5 a board string is:
  //
  //   H E A X T        cells 0…4
  //   Z Z A R Z        cells 5…9
  //   Z Z Z Z Z        (and three more rows of Z)
  //
  // HEART spells two ways — through either A — and the point of this walk is
  // that everything OUTSIDE that choice stays settled the whole time.
  const B = 'HEAXTZZARZZZZZZZZZZZZZZZ' + 'Z'
  const cells = (word: string) => {
    const { certain, possible, reach } = traceCellsStr(B, word)
    return {
      certain: [...certain].sort((a, b) => a - b),
      possible: [...possible].sort((a, b) => a - b),
      reach,
    }
  }

  it('settles a letter with one candidate tile', () => {
    expect(cells('he')).toEqual({ certain: [0, 1], possible: [], reach: 2 })
  })

  it('holds both tiles when a letter could be either', () => {
    // The A is the choice; H and E are not, and do not become one.
    expect(cells('hea')).toEqual({ certain: [0, 1], possible: [2, 7], reach: 3 })
  })

  it('keeps settling the letters after an open one', () => {
    // Both As reach the R, so the R is settled while the A is still open —
    // the board adds certainty rightward without resolving what came before.
    expect(cells('hear')).toEqual({ certain: [0, 1, 8], possible: [2, 7], reach: 4 })
    expect(cells('heart')).toEqual({ certain: [0, 1, 4, 8], possible: [2, 7], reach: 5 })
  })

  it('keeps the prefix lit when a letter the board cannot follow arrives', () => {
    // No R touches the E, so HER stops at two: the marks stay where HE put them
    // and `reach` is what says the R (and everything after it) is unspellable.
    expect(cells('her')).toEqual({ certain: [0, 1], possible: [], reach: 2 })
    expect(cells('herd')).toEqual({ certain: [0, 1], possible: [], reach: 2 })
  })

  it('lights nothing when the very first letter is off the board', () => {
    expect(cells('q')).toEqual({ certain: [], possible: [], reach: 0 })
    expect(cells('')).toEqual({ certain: [], possible: [], reach: 0 })
  })

  it('calls everything merely possible once the walk runs out of budget', () => {
    // A board of one letter multiplies routes without end. The walk stops, and
    // what it reports is the honest half: these tiles are in play, and it can no
    // longer say which of them a letter is pinned to.
    const { certain, possible, reach } = traceCellsStr('A'.repeat(25), 'aaaaaaa')
    expect(certain).toEqual([])
    expect(possible.length).toBe(25)
    expect(reach).toBe(7)
  })
})
