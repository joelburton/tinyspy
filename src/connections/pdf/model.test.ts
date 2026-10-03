// cs-blessed-connections

/**
 * Tests for the connections print model.
 *
 * The renderer is smoke-tested by `e2e/connections-print.e2e.ts`; what's pinned
 * here is the judgment — above all the **A–D letter**, which is the only thing
 * telling a black-and-white reader which category was which once the band
 * colors have all flattened to the same gray; and **whose bands belong on
 * whose board** — compete splits into one track per player, the full answer
 * prints once (on the viewer's track), and a rival's track shows only what
 * they earned.
 */

import { describe, expect, it } from 'vitest'
import { buildConnectionsPrintModel, RANK_LETTER } from './model'
import type { GCategory, GEvent, GMatchedCat, GPlayer } from '../types'

const CATS: GCategory[] = [
  { rank: 0, name: 'Starts with A', tiles: ['ALPHA', 'ANGEL', 'APPLE', 'ARROW'] },
  { rank: 1, name: 'Starts with B', tiles: ['BANANA', 'BIRCH', 'BREAD', 'BRICK'] },
  { rank: 2, name: 'Starts with C', tiles: ['CASTLE', 'CIRCLE', 'CLOUD', 'CROWN'] },
  { rank: 3, name: 'Starts with D', tiles: ['DAGGER', 'DELTA', 'DIAMOND', 'DRAGON'] },
]

const ME = { id: 'u1', username: 'me', color: 'red' } as GPlayer
const MOTH = { id: 'u2', username: 'moth', color: 'blue' } as GPlayer

const matched = (rank: 0 | 1 | 2 | 3): GMatchedCat => ({
  ...CATS[rank]!,
  matchedAt: '2026-01-01T00:00:00Z',
})

const guess = (over: Partial<GEvent> = {}): GEvent => ({
  id: 1,
  by: ME,
  tiles: ['ALPHA', 'ANGEL', 'APPLE', 'BANANA'],
  outcome: 'lost', result: 'wrong', matched: false,
  matchedCatRank: null,
  at: '2026-01-01T00:00:00Z',
  ...over,
})

const base = {
  brand: 'WordKnit',
  gameTitle: 'Connections',
  date: '1 Jan 2026',
  cats: CATS,
  matchedCats: [] as GMatchedCat[],
  unmatchedCats: [] as GCategory[],
  tilesLeft: [] as string[],
  guesses: [] as GEvent[],
  players: [
    { id: 'u1', username: 'me' },
    { id: 'u2', username: 'moth' },
  ],
  myId: 'u1',
  mode: 'coop' as const,
  isGameEnded: false,
  nMistakes: 1,
  maxMistakes: 4,
  setupRows: [{ key: 'puzzle', label: 'Puzzle', value: '2026-01-01' }],
}

/** Coop's single shared track — where most band judgments are pinned. */
const team = (over: Partial<Parameters<typeof buildConnectionsPrintModel>[0]>) =>
  buildConnectionsPrintModel({ ...base, ...over }).tracks[0]!

describe('buildConnectionsPrintModel — bands', () => {
  it('gives every band its A–D letter, in difficulty order', () => {
    const t = team({ matchedCats: [matched(2), matched(0)] })
    // Sorted by rank regardless of the order they were solved in.
    expect(t.bands.map((b) => [b.rank, b.letter])).toEqual([
      [0, 'A'],
      [2, 'C'],
    ])
    expect(RANK_LETTER[3]).toBe('D')
  })

  it('prints solved and end-of-game-revealed bands IDENTICALLY', () => {
    // Matching the screen: a category you worked out and one the game handed
    // you look the same, on purpose.
    const t = team({
      isGameEnded: true,
      matchedCats: [matched(0)],
      unmatchedCats: [CATS[1]!, CATS[2]!, CATS[3]!],
    })
    expect(t.bands).toHaveLength(4)
    expect(Object.keys(t.bands[0]!)).toEqual(Object.keys(t.bands[1]!))
    expect(t.bands.map((b) => b.letter)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('carries each band’s name and its four words', () => {
    const t = team({ matchedCats: [matched(1)] })
    expect(t.bands[0]!.name).toBe('Starts with B')
    expect(t.bands[0]!.tiles).toEqual(['BANANA', 'BIRCH', 'BREAD', 'BRICK'])
  })

  it('never prints a tile both as a band and as a leftover (the reveal double-draw)', () => {
    // The leftover grid is filtered against every BANDED tile, revealed as
    // well as matched — else a revealed category's words print twice, once in
    // its band and once below.
    const t = team({
      isGameEnded: true,
      matchedCats: [matched(0)],
      unmatchedCats: [CATS[1]!, CATS[2]!, CATS[3]!],
      tilesLeft: [...CATS[1]!.tiles, ...CATS[2]!.tiles, ...CATS[3]!.tiles],
    })
    expect(t.tilesLeft).toEqual([])
  })
})

describe('buildConnectionsPrintModel — the log', () => {
  it('names a correct guess by its category LETTER, tying the row to the band', () => {
    const t = team({
      guesses: [guess({ outcome: 'won', result: 'correct', matched: true, matchedCatRank: 2, tiles: CATS[2]!.tiles })],
    })
    expect(t.turns[0]!.text).toBe('C: CASTLE · CIRCLE · CLOUD · CROWN')
  })

  it('keeps the other two verdicts terse — the move column holds ~38 chars', () => {
    const t = team({
      guesses: [guess({ outcome: 'near', result: 'oneAway', matched: false }), guess({ id: 2, outcome: 'lost', result: 'wrong', matched: false })],
    })
    expect(t.turns[0]!.text).toMatch(/^1 away: /)
    expect(t.turns[1]!.text).toMatch(/^miss: /)
    // ~38 chars is what the renderer's move column actually holds at 9pt, and
    // four tiles plus the prefix has to fit inside it. Measured, not guessed —
    // 'one away — …' overflowed and truncated the last tile.
    t.turns.forEach((x) => expect(x.text.length).toBeLessThanOrEqual(38))
  })

  it('names the guesser on every coop row', () => {
    const t = team({ guesses: [guess(), guess({ id: 2, by: MOTH })] })
    expect(t.turns.map((x) => x.who)).toEqual(['me', 'moth'])
  })
})

describe('buildConnectionsPrintModel — compete splits per player', () => {
  const gs = [
    guess({ id: 1, by: ME, outcome: 'won', result: 'correct', matched: true, matchedCatRank: 0, tiles: CATS[0]!.tiles }),
    guess({ id: 2, by: MOTH, outcome: 'won', result: 'correct', matched: true, matchedCatRank: 2, tiles: CATS[2]!.tiles }),
    guess({ id: 3, by: MOTH, outcome: 'lost', result: 'wrong', matched: false }),
  ]

  it('once the game has ended: one track per player, each with only their own earned bands', () => {
    const m = buildConnectionsPrintModel({
      ...base,
      mode: 'compete',
      isGameEnded: true,
      guesses: gs,
      matchedCats: [matched(0)],
      unmatchedCats: [CATS[1]!, CATS[2]!, CATS[3]!],
      tilesLeft: [...CATS[1]!.tiles, ...CATS[2]!.tiles, ...CATS[3]!.tiles],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])

    const [mine, theirs] = m.tracks as [typeof m.tracks[0], typeof m.tracks[1]]
    // The viewer's track carries the full answer (their reveal), like their
    // screen; the rival's shows only the band THEY earned, everything else
    // still the plain grid — that's their story.
    expect(mine.bands.map((b) => b.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(mine.tilesLeft).toEqual([])
    expect(theirs.bands.map((b) => b.letter)).toEqual(['C'])
    expect(theirs.tilesLeft).toEqual([...CATS[0]!.tiles, ...CATS[1]!.tiles, ...CATS[3]!.tiles])
    // Scores and logs are per player too.
    expect(mine.result).toBe('1/4 categories found · 1/4 mistakes')
    expect(theirs.result).toBe('1/4 categories found · 1/4 mistakes')
    expect(mine.turns).toHaveLength(1)
    expect(theirs.turns.map((x) => x.text)).toEqual([
      'C: CASTLE · CIRCLE · CLOUD · CROWN',
      'miss: ALPHA · ANGEL · APPLE · BANANA',
    ])
  })

  it('mid-game: only the viewer\'s track (rivals\' guesses are withheld)', () => {
    const m = buildConnectionsPrintModel({
      ...base,
      mode: 'compete',
      guesses: gs.filter((g) => g.by === ME),
      matchedCats: [matched(0)],
      tilesLeft: [...CATS[1]!.tiles, ...CATS[2]!.tiles, ...CATS[3]!.tiles],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
    expect(m.tracks[0]!.bands.map((b) => b.letter)).toEqual(['A'])
    expect(m.tracks[0]!.tilesLeft).toHaveLength(12)
  })
})

describe('buildConnectionsPrintModel — summary', () => {
  it('coop mirrors the on-screen readout; compete says what the page holds', () => {
    const coop = buildConnectionsPrintModel({ ...base, matchedCats: [matched(0), matched(1)], nMistakes: 3 })
    expect(coop.summary).toBe('2/4 categories found · 3/4 mistakes')
    const compete = buildConnectionsPrintModel({ ...base, mode: 'compete' })
    expect(compete.summary).toBe('Compete · 2 players')
  })
})
