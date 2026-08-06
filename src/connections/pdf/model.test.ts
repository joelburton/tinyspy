/**
 * Tests for the connections print model.
 *
 * The renderer is smoke-tested by `e2e/connections-print.e2e.ts`; what's pinned
 * here is the judgment — above all the **A–D letter**, which is the only thing
 * telling a black-and-white reader which category was which once the band
 * colours have all flattened to the same grey.
 */

import { describe, expect, it } from 'vitest'
import { buildConnectionsPrintModel, RANK_LETTER } from './model'
import type { Category } from '../lib/board'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'

const CATS: Category[] = [
  { rank: 0, name: 'Starts with A', tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'] },
  { rank: 1, name: 'Starts with B', tiles: ['BANANA', 'BIRCH', 'BREAD', 'BRICK'] },
  { rank: 2, name: 'Starts with C', tiles: ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'] },
  { rank: 3, name: 'Starts with D', tiles: ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'] },
]

const matched = (rank: 0 | 1 | 2 | 3): MatchedCategory => ({
  ...CATS[rank],
  matched_at: '2026-01-01T00:00:00Z',
})

const guess = (over: Partial<GuessRow> = {}): GuessRow => ({
  id: 'g1',
  user_id: 'u1',
  tiles: ['ALPHA', 'ANGEL', 'APPLE', 'BANANA'],
  result: 'wrong',
  matched_category_rank: null,
  guessed_at: '2026-01-01T00:00:00Z',
  ...over,
})

const base = {
  brand: 'WordKnit',
  gameTitle: 'Connections',
  date: '1 Jan 2026',
  categories: CATS,
  matched: [] as MatchedCategory[],
  unmatched: [] as Category[],
  remainingTiles: [] as string[],
  guesses: [] as GuessRow[],
  players: [
    { user_id: 'u1', username: 'me' },
    { user_id: 'u2', username: 'moth' },
  ],
  selfId: 'u1',
  mode: 'coop' as const,
  isTerminal: false,
  mistakes: 1,
  maxMistakes: 4,
  setup: [{ key: 'puzzle', label: 'Puzzle', value: '2026-01-01' }],
}

describe('buildConnectionsPrintModel — bands', () => {
  it('gives every band its A–D letter, in difficulty order', () => {
    const m = buildConnectionsPrintModel({ ...base, matched: [matched(2), matched(0)] })
    // Sorted by rank regardless of the order they were solved in.
    expect(m.bands.map((b) => [b.rank, b.letter])).toEqual([
      [0, 'A'],
      [2, 'C'],
    ])
    expect(RANK_LETTER[3]).toBe('D')
  })

  it('prints solved and end-of-game-revealed bands IDENTICALLY', () => {
    // Matching the screen: a category you worked out and one the game handed
    // you look the same, on purpose.
    const m = buildConnectionsPrintModel({
      ...base,
      isTerminal: true,
      matched: [matched(0)],
      unmatched: [CATS[1], CATS[2], CATS[3]],
    })
    expect(m.bands).toHaveLength(4)
    expect(Object.keys(m.bands[0])).toEqual(Object.keys(m.bands[1]))
    expect(m.bands.map((b) => b.letter)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('carries each band’s name and its four words', () => {
    const m = buildConnectionsPrintModel({ ...base, matched: [matched(1)] })
    expect(m.bands[0].name).toBe('Starts with B')
    expect(m.bands[0].tiles).toEqual(['BANANA', 'BIRCH', 'BREAD', 'BRICK'])
  })
})

describe('buildConnectionsPrintModel — the log', () => {
  it('names a correct guess by its category LETTER, tying the row to the band', () => {
    const m = buildConnectionsPrintModel({
      ...base,
      guesses: [guess({ result: 'correct', matched_category_rank: 2, tiles: CATS[2].tiles })],
    })
    expect(m.turns[0].text).toBe('C: CASTLE · CIRCLE · CLOUD · CROWN')
  })

  it('keeps the other two verdicts terse — the move column holds ~38 chars', () => {
    const m = buildConnectionsPrintModel({
      ...base,
      guesses: [guess({ result: 'oneAway' }), guess({ id: 'g2', result: 'wrong' })],
    })
    expect(m.turns[0].text).toMatch(/^1 away: /)
    expect(m.turns[1].text).toMatch(/^miss: /)
    // ~38 chars is what the renderer's move column actually holds at 9pt, and
    // four tiles plus the prefix has to fit inside it. Measured, not guessed —
    // 'one away — …' overflowed and truncated the last tile.
    m.turns.forEach((t) => expect(t.text.length).toBeLessThanOrEqual(38))
  })

  it('names the guesser on every row', () => {
    const m = buildConnectionsPrintModel({
      ...base,
      guesses: [guess(), guess({ id: 'g2', user_id: 'u2' })],
    })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })

  it('groups compete by player (self first); coop stays in play order', () => {
    const gs = [
      guess({ id: 'a', user_id: 'u2', guessed_at: '2026-01-01T00:00:01Z' }),
      guess({ id: 'b', user_id: 'u1', guessed_at: '2026-01-01T00:00:02Z' }),
      guess({ id: 'c', user_id: 'u2', guessed_at: '2026-01-01T00:00:03Z' }),
    ]
    expect(
      buildConnectionsPrintModel({ ...base, mode: 'compete', guesses: gs }).turns.map((t) => t.who),
    ).toEqual(['me', 'moth', 'moth'])
    expect(buildConnectionsPrintModel({ ...base, guesses: gs }).turns.map((t) => t.who)).toEqual([
      'moth',
      'me',
      'moth',
    ])
  })
})

describe('buildConnectionsPrintModel — summary', () => {
  it('mirrors the on-screen readout', () => {
    const m = buildConnectionsPrintModel({ ...base, matched: [matched(0), matched(1)], mistakes: 3 })
    expect(m.summary).toBe('2/4 categories found · 3/4 mistakes')
  })
})
