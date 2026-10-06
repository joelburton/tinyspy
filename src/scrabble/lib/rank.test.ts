// cs-unmet

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildTrie, walkWord } from '@/shared/dict-trie/trie'
import { cellIndex, makeCellId, makeEmptyBoard } from './board'
import { evaluatePlay, tilesUsed } from './play'
import { generateMoves } from './suggest'
import { leaveValue, rankMoves } from './rank'
import type { GBands, GPlacement } from '../types'

const emptyBoard = makeEmptyBoard

describe('leaveValue — the hand-rolled leave heuristic', () => {
  // These pin the CURRENT weights (they're the tunable surface — retuning
  // means updating these numbers, deliberately).

  it('values the blank as pure option value', () => {
    expect(leaveValue(['?'])).toBe(24)
  })

  it('S is the premier hook tile; additional S’s diminish (no double dup-penalty)', () => {
    expect(leaveValue(['s'])).toBe(8)
    // 8 + 3 for the second S, then −1.5 for the 2-consonant imbalance —
    // NOT an extra −2.5 duplicate penalty (the S ladder is its own rule).
    expect(leaveValue(['s', 's'])).toBe(9.5)
  })

  it('penalizes duplicates beyond the first', () => {
    // E+E = 2+2, −2.5 dup, −1.5 for two vowels vs none.
    expect(leaveValue(['e', 'e'])).toBe(0)
  })

  it('taxes a stranded Q, with U or blank as the escape hatch', () => {
    expect(leaveValue(['q'])).toBe(-12)      // −8 base −4 stranded
    expect(leaveValue(['q', 'u'])).toBe(-10) // −8 −2 for the U; not stranded
    expect(leaveValue(['q', '?'])).toBe(16)  // −8 +24; the blank can be the U
  })

  it('penalizes vowel/consonant imbalance beyond ±1', () => {
    // A+E+I+O = 1+2+0+0, imbalance |4−0|−1 = 3 units → −4.5.
    expect(leaveValue(['a', 'e', 'i', 'o'])).toBe(-1.5)
  })

  it('an empty leave (bingo/full-rack play) is worth 0', () => {
    expect(leaveValue([])).toBe(0)
  })
})

describe('rankMoves', () => {
  // Hand-built first plays on an empty board (center star = DW):
  //   CAT  (3+1+1)×2 = 10      AT (1+1)×2 = 4      CATS (3+1+1+1)×2 = 12
  const CAT: GPlacement[] = [
    { x: 7, y: 7, letter: 'c', blank: false },
    { x: 8, y: 7, letter: 'a', blank: false },
    { x: 9, y: 7, letter: 't', blank: false },
  ]
  const AT: GPlacement[] = [
    { x: 7, y: 7, letter: 'a', blank: false },
    { x: 8, y: 7, letter: 't', blank: false },
  ]
  const CATS: GPlacement[] = [...CAT, { x: 10, y: 7, letter: 's', blank: false }]
  // CAT played DOWN through the center — the opening transpose the generator
  // rightly keeps as a distinct move, but identical to a reader: same word,
  // same score (the center star is DW either orientation).
  const CAT_DOWN: GPlacement[] = [
    { x: 7, y: 7, letter: 'c', blank: false },
    { x: 7, y: 8, letter: 'a', blank: false },
    { x: 7, y: 9, letter: 't', blank: false },
  ]
  const board = emptyBoard()
  const anyDifficulty = () => 1

  it('equity = evaluatePlay score + leaveValue of the kept tiles, sorted descending', () => {
    const rack = ['c', 'a', 't', 's']
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
    expect(rankMoves(board, [AT, CAT, CATS], ['c', 'a', 't', 's'], anyDifficulty, { topN: 2 }))
      .toHaveLength(2)
  })

  it('vocabCap drops moves containing a word above the cap', () => {
    const difficulty = (word: string) => (word === 'cat' ? 5 : 1)
    const ranked = rankMoves(board, [AT, CAT], ['c', 'a', 't'], difficulty, { vocabCap: 4 })
    expect(ranked.map((m) => m.placements)).toEqual([AT])
  })

  it('scoreFraction re-aims at a fraction of the best equity', () => {
    const rack = ['c', 'a', 't', 's']
    // Equities: CAT 18, CATS 12, AT 10.5 (leave C+S = 8, −1.5 imbalance).
    // Target 0.6 × 18 = 10.8 → AT is nearest.
    const ranked = rankMoves(board, [AT, CAT, CATS], rack, anyDifficulty, { scoreFraction: 0.6 })
    expect(ranked[0].placements).toBe(AT)
  })

  it('useLeave: false makes equity pure score', () => {
    const ranked = rankMoves(
      board, [AT, CAT, CATS], ['c', 'a', 't', 's'], anyDifficulty, { useLeave: false })
    expect(ranked[0].placements).toBe(CATS) // 12 beats CAT's 10 without the leave
    for (const m of ranked) expect(m.equity).toBe(m.score)
  })

  it('throws on a geometrically invalid move — a generator bug must be loud', () => {
    const floating: GPlacement[] = [{ x: 0, y: 0, letter: 'a', blank: false }]
    expect(() => rankMoves(board, [floating], ['a'], anyDifficulty)).toThrow(/invalid play/)
  })

  it('collapses duplicate word+score rows for display (fixes §1)', () => {
    // CAT and CAT_DOWN are the same word at the same score (the opening
    // transpose): one belongs on the list, not both. CATS is genuinely
    // different, so it fills the freed slot.
    const rack = ['c', 'a', 't', 's']
    const ranked = rankMoves(board, [CAT, CAT_DOWN, CATS], rack, anyDifficulty)
    const keyOf = (m: (typeof ranked)[number]) =>
      [...m.words.map((w) => w.word)].sort().join(',') + `|${m.score}`
    const keys = ranked.map(keyOf)
    expect(new Set(keys).size).toBe(keys.length) // every shown row is distinct
    expect(keys).toContain('cat|10')
    expect(keys).toContain('cats|12')
    expect(ranked).toHaveLength(2) // the two CATs collapsed to one
  })

  it('a first move never shows the same word+score twice (CATSERO repro)', () => {
    // The review's empirical repro: a full rack on the opening produced a
    // top-5 of COATS, COATS, TACO, TACO, TACO — 2 distinct plays wearing 5
    // rows. Every opening word generates an across form AND its transpose at
    // an identical score, so raw generation is riddled with display dupes;
    // the top-5 the player sees must be distinct.
    const WORDS: [string, number][] = [
      ['at', 1], ['as', 1], ['re', 1], ['oe', 3], ['ar', 3], ['os', 3], ['to', 1], ['so', 1], ['or', 1], ['ta', 3],
      ['cat', 1], ['oat', 1], ['oar', 2], ['ore', 2], ['are', 1], ['ear', 1], ['era', 2], ['ace', 1], ['arc', 2],
      ['car', 1], ['rat', 1], ['tar', 1], ['sat', 1], ['set', 1], ['toe', 1], ['cot', 2], ['roe', 2], ['sea', 1],
      ['coat', 1], ['taco', 2], ['cats', 1], ['oats', 1], ['care', 1], ['race', 1], ['core', 1], ['acre', 2],
      ['cast', 1], ['scat', 3], ['orca', 3], ['sore', 1], ['rose', 1], ['rate', 1], ['tear', 1], ['tare', 3],
      ['coats', 2], ['tacos', 2], ['cores', 2], ['cares', 2], ['races', 2], ['scare', 2], ['coast', 2], ['actor', 2],
      ['caster', 3], ['castor', 4], ['costar', 4], ['coaster', 3],
    ]
    const trie = buildTrie(WORDS.map(([w]) => w), WORDS.map(([, r]) => r))
    const bands: GBands = { dict2: 6, dict3plus: 6 }
    const rack = ['c', 'a', 't', 's', 'e', 'r', 'o']
    const first = emptyBoard()
    const moves = generateMoves(first, rack, trie, bands)
    const wordDifficulty = (word: string) => trie.eow[walkWord(trie, word)]
    const keyOf = (words: { word: string }[], score: number) =>
      [...words.map((w) => w.word)].sort().join(',') + `|${score}`

    const ranked = rankMoves(first, moves, rack, wordDifficulty) // default top 5
    const shownKeys = ranked.map((m) => keyOf(m.words, m.score))
    expect(new Set(shownKeys).size).toBe(shownKeys.length) // the displayed rows are distinct

    // Prove the guarantee bites: raw generation really did contain dupes.
    const rawKeys = moves.map((placements) => {
      const ev = evaluatePlay(first, placements)
      if (!ev.valid) throw new Error('fixture generated an invalid move')
      return keyOf(ev.words, ev.score)
    })
    expect(rawKeys.length).toBeGreaterThan(new Set(rawKeys).size)
  })

  it('ranks generateMoves output end-to-end', () => {
    const DICT: [string, number][] = [
      ['at', 1], ['ta', 3], ['cat', 1], ['cats', 1], ['sat', 1], ['tas', 4],
    ]
    const trie = buildTrie(DICT.map(([w]) => w), DICT.map(([, r]) => r))
    const bands: GBands = { dict2: 6, dict3plus: 6 }
    const midGame = emptyBoard()
    for (const [x, letter] of [[5, 'c'], [6, 'a'], [7, 't']] as const) {
      const id = makeCellId(x, 7)
      midGame[cellIndex(x, 7)] = { id, tile: { id, letter, blank: false } }
    }
    const rack = ['s', 'a', 't']
    const moves = generateMoves(midGame, rack, trie, bands)
    expect(moves.length).toBeGreaterThan(0)

    const wordDifficulty = (word: string) => trie.eow[walkWord(trie, word)]
    const ranked = rankMoves(midGame, moves, rack, wordDifficulty)
    expect(ranked.length).toBeLessThanOrEqual(5)
    // The head of the list has the max equity over the FULL move list.
    const all = rankMoves(midGame, moves, rack, wordDifficulty, { topN: moves.length })
    expect(ranked[0].equity).toBe(Math.max(...all.map((m) => m.equity)))
  })
})
