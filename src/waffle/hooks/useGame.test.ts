// cs-unmet

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the setup rows built, each seat's
 * facts carried through — and the seat rule, which is the one thing the blob
 * does not carry: a rival's rows and board are withheld mid-race and nowhere
 * else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_DEALT,
  ZTest_SOLVED,
  ZTest_makeGameDataRaw,
  ZTest_makeWaffleCtx,
  ZTest_swap,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** Each has swapped once: me cells 2 and 3, moth cells 0 and 1. The colors
 *  after are facts, not worked out. */
const EVENTS = [
  ZTest_swap(1, 'u1', [2, 3], ZTest_DEALT, 'yyyygg.g.ggggggg.g.gggggg'),
  ZTest_swap(2, 'u2', [0, 1], ZTest_DEALT, 'gggggg.g.ggggggg.g.gggggg'),
]

describe('waffle makeGameData — the links become players', () => {
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

  it('gives each log row its player, and keeps its two tiles', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events[0]!.by).toBe(gd.me)
    expect(gd.events[1]!.by).toBe(gd.playersById.u2)
    expect(gd.events[0]).not.toHaveProperty('userId')
    expect(gd.events[0]!.swaps).toEqual([{ id: '2', letter: 'c' }, { id: '3', letter: 'd' }])
  })

  it('builds the setup rows once, with par, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, parSwaps: 10 }), 'u1')
    expect(gd.setupRows.find((r) => r.key === 'extra_swaps')?.value).toBe('15 (par 10 + 5 extra)')
  })

  it('carries the puzzle, the counts and the rest through from the blob', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.puzzle.dealtTiles).toHaveLength(21)
    expect(gd.puzzle.solution).toBeNull()
    // My own swap; the team's two.
    expect([gd.me.nSwapsUsed, gd.me.maxSwaps]).toEqual([1, 6])
    expect(gd.team).toEqual({ nSwapsUsed: 2 })
    expect(gd.stateLineData).toEqual({ nSwapsUsed: 2, maxSwaps: 6, parSwaps: 1 })
    expect(gd.brand).toBe('SyrupSwap')
  })

  it('hands the solution over once the game has ended', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
        outcome: 'neutral',
      }),
      'u1',
    )
    expect(gd.puzzle.solution?.[0]).toEqual({ id: '0', letter: 'a' })
  })
})

describe('waffle makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({
    mode: 'compete',
    players: [TWO[0]!, { ...TWO[1]!, board: ZTest_SOLVED }],
    events: EVENTS,
    ...over,
  })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.tiles[0]).toEqual({ id: '0', letter: 'b', color: 'y' })
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2])
    expect(gd.playersById.u2!.board!.tiles[0]).toEqual({ id: '0', letter: 'a', color: 'g' })
  })

  it('coop withholds nothing: one board, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(2)
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
  })

  it('a rival\'s count stays visible mid-race — the strip shows it', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.playersById.u2!.nSwapsUsed).toBe(1)
  })

  it('a race has no team, so the state line shows my own count', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.team).toBeNull()
    expect(gd.stateLineData).toEqual({ nSwapsUsed: 1, maxSwaps: 6, parSwaps: 1 })
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('waffle useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeWaffleCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeWaffleCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeWaffleCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(2)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeWaffleCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
