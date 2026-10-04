// cs-unmet

/**
 * WHAT A BEE GAME'S GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeBeeGameData` is a pure function of the blob and who I am, so this tests
 * it directly: the links turned into players, each row's player, the setup
 * rows built once from the players, the readout decided once — and the seat
 * rule, which is the one thing the blob does not carry: a rival's rows are
 * withheld mid-race and nowhere else, while their counts stay.
 */
import { describe, expect, it, vi } from 'vitest'
import { makeBeeGameData } from './beeGameData'
import { ZTest_find, ZTest_makeBeeGameDataRaw } from './beeGameData.fixture'

const GAME = {
  gametypePrefix: 'bee',
  brand: 'BeeTest',
  centerLetter: 'e',
  outerLetters: 'abcdfg',
  defaultSetup: { timer: { kind: 'none' as const } },
}

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** me found bead; moth found faced. */
const EVENTS = [ZTest_find('u1', 'bead', 1), ZTest_find('u2', 'faced', 5)]

const noRows = () => []

describe('makeBeeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO }), 'u1', noRows)
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('a bee game has no turns', () => {
    expect(makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO }), 'u1', noRows).turns).toBeNull()
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeBeeGameData(
      ZTest_makeBeeGameDataRaw(GAME, {
        mode: 'compete',
        players: TWO,
        ending: { reason: 'reached_goal', detail: 'target', by: 'u2', winner: 'u2' },
        outcome: 'won',
      }),
      'u1',
      noRows,
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
    expect(gd.ended).toBe(true)
  })

  it("a timeout nobody's turn covers ended by nobody", () => {
    const gd = makeBeeGameData(
      ZTest_makeBeeGameDataRaw(GAME, {
        players: TWO,
        ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
        outcome: 'neutral',
      }),
      'u1',
      noRows,
    )
    expect(gd.ending?.by).toBeNull()
    expect(gd.ending?.winner).toBeNull()
  })

  it('gives each found word its player', () => {
    const gd = makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO, events: EVENTS }), 'u1', noRows)
    expect(gd.events.map((e) => [e.by.username, e.word])).toEqual([['me', 'bead'], ['moth', 'faced']])
  })

  it('builds the setup rows once, from the players', () => {
    const makeSetupRows = vi.fn(() => [{ key: 'k', label: 'L', value: 'v' }])
    const gd = makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO }), 'u1', makeSetupRows)
    expect(makeSetupRows).toHaveBeenCalledTimes(1)
    expect(makeSetupRows).toHaveBeenCalledWith(gd.players)
    expect(gd.setupRows).toEqual([{ key: 'k', label: 'L', value: 'v' }])
  })

  it('carries the puzzle and the counts through from the blob', () => {
    const gd = makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO, events: EVENTS }), 'u1', noRows)
    expect(gd.puzzle.tiles[0]).toEqual({ id: '0', letter: 'e', isCenter: true })
    expect(gd.puzzle.tiles).toHaveLength(7)
    expect(gd.puzzle.reqdWordsScore).toBe(6)
    expect([gd.me.nFoundWords, gd.me.foundWordsScore]).toEqual([1, 1])
    expect([gd.playersById.u2!.nFoundWords, gd.playersById.u2!.foundWordsScore]).toEqual([1, 5])
  })

  it("the readout shows the team's finds in coop, against the required set and the target", () => {
    const gd = makeBeeGameData(
      ZTest_makeBeeGameDataRaw(GAME, { players: TWO, events: EVENTS, targetRankIdx: 3 }),
      'u1',
      noRows,
    )
    expect(gd.stateLineData).toEqual({
      nFoundWords: 2, foundWordsScore: 6, rankIdx: gd.team!.rankIdx,
      nReqdWords: 2, reqdWordsScore: 6, targetRankIdx: 3,
    })
  })
})

describe('makeBeeGameData — the seat rule', () => {
  const race = (over: Parameters<typeof ZTest_makeBeeGameDataRaw>[1] = {}) =>
    ZTest_makeBeeGameDataRaw(GAME, { mode: 'compete', players: TWO, events: EVENTS, targetRankIdx: 3, ...over })

  it("mid-race, a rival's rows leave the log", () => {
    const gd = makeBeeGameData(race(), 'u1', noRows)
    expect(gd.events.map((e) => e.word)).toEqual(['bead'])
  })

  it("a rival's counts stay visible mid-race — the strip shows them", () => {
    const gd = makeBeeGameData(race(), 'u1', noRows)
    expect(gd.playersById.u2!.foundWordsScore).toBe(5)
  })

  it("the race's end opens everything", () => {
    const gd = makeBeeGameData(
      race({ ending: { reason: 'reached_goal', detail: 'target', by: 'u2', winner: 'u2' }, outcome: 'won' }),
      'u1',
      noRows,
    )
    expect(gd.events.map((e) => e.word)).toEqual(['bead', 'faced'])
  })

  it('coop withholds nothing: one list, one team', () => {
    const gd = makeBeeGameData(ZTest_makeBeeGameDataRaw(GAME, { players: TWO, events: EVENTS }), 'u1', noRows)
    expect(gd.events).toHaveLength(2)
    expect(gd.team).not.toBeNull()
  })

  it('a race has no team, so the readout shows my own counts', () => {
    const gd = makeBeeGameData(race(), 'u1', noRows)
    expect(gd.team).toBeNull()
    expect([gd.stateLineData.nFoundWords, gd.stateLineData.foundWordsScore]).toEqual([1, 1])
  })
})
