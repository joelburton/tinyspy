import { describe, expect, it } from 'vitest'
import { traceableStr } from './boardTrace'
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
