// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from '../../common/lib/game/trie'
import { cellIndex, type Cell } from './board'
import { evaluatePlay, tilesUsed, type Placement } from './play'
import { generateMoves, type Bands } from './suggest'
import { leaveValue, rankMoves } from './rank'

const N = 15
const emptyBoard = (): Cell[] => new Array<Cell>(N * N).fill(null)

describe('leaveValue — the hand-rolled leave heuristic', () => {
  // These pin the CURRENT weights (they're the tunable surface — retuning
  // means updating these numbers, deliberately).

  it('values the blank as pure option value', () => {
    expect(leaveValue(['?'])).toBe(24)
  })

  it('S is the premier hook tile; additional S’s diminish (no double dup-penalty)', () => {
    expect(leaveValue(['S'])).toBe(8)
    // 8 + 3 for the second S, then −1.5 for the 2-consonant imbalance —
    // NOT an extra −2.5 duplicate penalty (the S ladder is its own rule).
    expect(leaveValue(['S', 'S'])).toBe(9.5)
  })

  it('penalizes duplicates beyond the first', () => {
    // E+E = 2+2, −2.5 dup, −1.5 for two vowels vs none.
    expect(leaveValue(['E', 'E'])).toBe(0)
  })

  it('taxes a stranded Q, with U or blank as the escape hatch', () => {
    expect(leaveValue(['Q'])).toBe(-12)      // −8 base −4 stranded
    expect(leaveValue(['Q', 'U'])).toBe(-10) // −8 −2 for the U; not stranded
    expect(leaveValue(['Q', '?'])).toBe(16)  // −8 +24; the blank can be the U
  })

  it('penalizes vowel/consonant imbalance beyond ±1', () => {
    // A+E+I+O = 1+2+0+0, imbalance |4−0|−1 = 3 units → −4.5.
    expect(leaveValue(['A', 'E', 'I', 'O'])).toBe(-1.5)
  })

  it('an empty leave (bingo/full-rack play) is worth 0', () => {
    expect(leaveValue([])).toBe(0)
  })
})

describe('rankMoves', () => {
  // Hand-built first plays on an empty board (center star = DW):
  //   CAT  (3+1+1)×2 = 10      AT (1+1)×2 = 4      CATS (3+1+1+1)×2 = 12
  const CAT: Placement[] = [
    { x: 7, y: 7, letter: 'C', blank: false },
    { x: 8, y: 7, letter: 'A', blank: false },
    { x: 9, y: 7, letter: 'T', blank: false },
  ]
  const AT: Placement[] = [
    { x: 7, y: 7, letter: 'A', blank: false },
    { x: 8, y: 7, letter: 'T', blank: false },
  ]
  const CATS: Placement[] = [...CAT, { x: 10, y: 7, letter: 'S', blank: false }]
  const board = emptyBoard()
  const anyDifficulty = () => 1

  it('equity = evaluatePlay score + leaveValue of the kept tiles, sorted descending', () => {
    const rack = ['C', 'A', 'T', 'S']
    const ranked = rankMoves(board, [AT, CAT, CATS], rack, anyDifficulty)
    expect(ranked.map((m) => m.equity)).toEqual([...ranked.map((m) => m.equity)].sort((a, b) => b - a))
    for (const m of ranked) {
      const ev = evaluatePlay(board, m.placements)
      if (!ev.valid) throw new Error('fixture move should be valid')
      expect(m.score).toBe(ev.score)
      const used = tilesUsed(m.placements)
      const kept = [...rack]
      for (const t of used) kept.splice(kept.indexOf(t), 1)
      expect(m.equity).toBe(m.score + leaveValue(kept))
    }
    // CAT keeps the S (10 + 8 = 18) and beats the bingo-less CATS (12 + 0).
    expect(ranked[0].placements).toBe(CAT)
  })

  it('respects topN', () => {
    expect(rankMoves(board, [AT, CAT, CATS], ['C', 'A', 'T', 'S'], anyDifficulty, { topN: 2 }))
      .toHaveLength(2)
  })

  it('vocabCap drops moves containing a word above the cap', () => {
    const difficulty = (word: string) => (word === 'CAT' ? 5 : 1)
    const ranked = rankMoves(board, [AT, CAT], ['C', 'A', 'T'], difficulty, { vocabCap: 4 })
    expect(ranked.map((m) => m.placements)).toEqual([AT])
  })

  it('scoreFraction re-aims at a fraction of the best equity', () => {
    const rack = ['C', 'A', 'T', 'S']
    // Equities: CAT 18, CATS 12, AT 10.5 (leave C+S = 8, −1.5 imbalance).
    // Target 0.6 × 18 = 10.8 → AT is nearest.
    const ranked = rankMoves(board, [AT, CAT, CATS], rack, anyDifficulty, { scoreFraction: 0.6 })
    expect(ranked[0].placements).toBe(AT)
  })

  it('useLeave: false makes equity pure score', () => {
    const ranked = rankMoves(
      board, [AT, CAT, CATS], ['C', 'A', 'T', 'S'], anyDifficulty, { useLeave: false })
    expect(ranked[0].placements).toBe(CATS) // 12 beats CAT's 10 without the leave
    for (const m of ranked) expect(m.equity).toBe(m.score)
  })

  it('throws on a geometrically invalid move — a generator bug must be loud', () => {
    const floating: Placement[] = [{ x: 0, y: 0, letter: 'A', blank: false }]
    expect(() => rankMoves(board, [floating], ['A'], anyDifficulty)).toThrow(/invalid play/)
  })

  it('ranks generateMoves output end-to-end', () => {
    const DICT: [string, number][] = [
      ['at', 1], ['ta', 3], ['cat', 1], ['cats', 1], ['sat', 1], ['tas', 4],
    ]
    const trie = buildTrie(DICT.map(([w]) => w), DICT.map(([, r]) => r))
    const bands: Bands = { dict2: 6, dict3plus: 6 }
    const midGame = emptyBoard()
    midGame[cellIndex(5, 7)] = { l: 'C', b: false }
    midGame[cellIndex(6, 7)] = { l: 'A', b: false }
    midGame[cellIndex(7, 7)] = { l: 'T', b: false }
    const rack = ['S', 'A', 'T']
    const moves = generateMoves(midGame, rack, trie, bands)
    expect(moves.length).toBeGreaterThan(0)

    const wordDifficulty = (word: string) => trie.eow[walkWord(trie, word.toLowerCase())]
    const ranked = rankMoves(midGame, moves, rack, wordDifficulty)
    expect(ranked.length).toBeLessThanOrEqual(5)
    // The head of the list has the max equity over the FULL move list.
    const all = rankMoves(midGame, moves, rack, wordDifficulty, { topN: moves.length })
    expect(ranked[0].equity).toBe(Math.max(...all.map((m) => m.equity)))
  })
})
