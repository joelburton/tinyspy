// cs-blessed-connections

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, each log row read once, the setup
 * rows built, each seat's facts carried through — and the seat rule, which is
 * the one thing the blob does not carry: a rival's rows and board are withheld
 * mid-race and nowhere else. The picks room is `usePicks.test`'s.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_ELIMINATED,
  ZTest_PUZZLE,
  ZTest_guess,
  ZTest_makeConnectionsCtx,
  ZTest_makeGameDataRaw,
  ZTest_matchOf,
} from '../lib/gameData.fixture'

import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const [RED, GREEN] = ZTest_PUZZLE.cats as [typeof ZTest_PUZZLE.cats[0], typeof ZTest_PUZZLE.cats[1]]

/** me matched RED, then missed by one; moth matched GREEN. */
const EVENTS = [
  ZTest_matchOf(RED, 'u1'),
  ZTest_guess('u1', ['e', 'f', 'g', 'm'], 'oneAway'),
  ZTest_matchOf(GREEN, 'u2'),
]

describe('connections makeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('names the turn holder as a player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, turnHolderId: 'u2' }), 'u1')
    expect(gd.turns?.holder).toBe(gd.playersById.u2)
  })

  it('a free-for-all game has no turns', () => {
    expect(makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1').turns).toBeNull()
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: TWO,
        ending: { reason: 'reached_goal', detail: 'solved', by: 'u2', winner: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
    expect(gd.ended).toBe(true)
  })

  it('a timeout nobody\'s turn covers ended by nobody', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: TWO,
        ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
        outcome: 'lost',
      }),
      'u1',
    )
    expect(gd.ending).toEqual({ reason: 'timeout', detail: 'timeout', by: null, winner: null })
  })

  it('gives each log row its player, and reads it once: its outcome, and whether it matched', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    const [match, miss, theirs] = gd.events
    expect(match!.by).toBe(gd.me)
    expect(theirs!.by).toBe(gd.playersById.u2)
    expect(match).not.toHaveProperty('userId')
    expect(match).toMatchObject({ result: 'correct', matched: true, outcome: 'won', matchedCatRank: 0 })
    expect(miss).toMatchObject({ result: 'oneAway', matched: false, outcome: 'near', matchedCatRank: null })
  })

  it('builds the setup rows once, with the puzzle\'s date', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.find((r) => r.key === 'puzzle_id')?.value).toBe('June 15, 2026')
  })

  it('carries the puzzle, the counts and the board through from the blob', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.puzzle).toBe(ZTest_PUZZLE.cats === gd.puzzle.cats ? gd.puzzle : gd.puzzle)
    expect(gd.puzzle.cats).toHaveLength(4)
    // My own counts; the team's summed.
    expect([gd.me.nMatchedCats, gd.me.nMistakes, gd.me.maxMistakes]).toEqual([1, 1, 4])
    expect(gd.team).toEqual({ nMatchedCats: 2, nMistakes: 1 })
    // Coop: the team's two bands, in the order they were matched, and eight
    // tiles left in the puzzle's order.
    expect(gd.me.board.matchedCats.map((c) => c.name)).toEqual(['RED', 'GREEN'])
    expect(gd.me.board.tilesLeft).toEqual(['i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
    expect(gd.brand).toBe('WordKnit')
  })

  it('the state line shows the team\'s counts in coop', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.stateLineData).toEqual({ nMatchedCats: 2, nMistakes: 1, maxMistakes: 4 })
  })
})

describe('connections makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS, ...over })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual(EVENTS.slice(0, 2).map((e) => e.id))
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see: RED is mine, so its four are gone; moth's
    // GREEN is still loose on my board.
    expect(gd.me.board.matchedCats.map((c) => c.name)).toEqual(['RED'])
    expect(gd.me.board.tilesLeft).toEqual(['e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events).toHaveLength(3)
    expect(gd.playersById.u2!.board!.matchedCats.map((c) => c.name)).toEqual(['GREEN'])
  })

  it('coop withholds nothing: one board, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(3)
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
  })

  it('a rival\'s counts stay visible mid-race — the strip shows them', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.playersById.u2!.nMatchedCats).toBe(1)
  })

  it('a race has no team, so the state line shows my own counts', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.team).toBeNull()
    expect(gd.stateLineData).toEqual({ nMatchedCats: 1, nMistakes: 1, maxMistakes: 4 })
  })

  it('a conceder and a racer out on mistakes are still players, with their endings', () => {
    const gd = makeGameData(
      race({ players: [{ ...TWO[0]!, ...ZTest_ELIMINATED }, { ...TWO[1]!, ...ZTest_CONCEDED }] }),
      'u1',
    )
    expect(gd.me.ending?.reason).toBe('resource_exhausted')
    expect(gd.me.stillPlaying).toBe(false)
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
  })
})


describe('connections useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeConnectionsCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeConnectionsCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeConnectionsCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(3)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeConnectionsCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})

