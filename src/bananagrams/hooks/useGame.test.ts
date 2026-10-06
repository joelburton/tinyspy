// cs-unmet

/**
 * WHAT THE PLAYAREA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the setup rows built, the state
 * line decided — and the seat rule, which is the one thing the blob does not
 * carry: a rival's letters are withheld mid-race and nowhere else, and their
 * counts never are.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyBoard } from '../lib/board'
import {
  ZTest_CONCEDED,
  ZTest_TILES,
  ZTest_across,
  ZTest_dump,
  ZTest_makeBananagramsCtx,
  ZTest_makeGameDataRaw,
  ZTest_peel,
  ZTest_wentOut,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

describe('bananagrams makeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('a race has no turns and no team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.turns).toBeNull()
    expect(gd.team).toBeNull()
  })

  it('names who went out and the winner as players', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: TWO,
        ending: { reason: 'reached_goal', detail: 'complete', by: 'u2', winner: 'u2' },
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

  it('gives each log row its player', () => {
    const events = [ZTest_dump(1, 'u1', 'q'), ZTest_peel(2, 'u2'), ZTest_wentOut(3, 'u2')]
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events }), 'u1')
    expect(gd.events.map((e) => [e.by, e.kind, e.tile, e.nDrawn])).toEqual([
      [gd.me, 'dump', 'q', 3],
      [gd.playersById.u2, 'peel', null, 1],
      [gd.playersById.u2, 'went_out', null, 0],
    ])
    expect(gd.events[0]).not.toHaveProperty('userId')
  })

  it('builds the setup rows once, with the roster', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('players')
    expect(gd.setupRows.map((r) => r.key)).toContain('bunch_size')
  })

  it('decides the state line: my tiles against the two piles', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({ players: TWO, nBunchTiles: 60, nBagTiles: 3 }),
      'u1',
    )
    expect(gd.stateLineData).toEqual({ nTiles: ZTest_TILES.length, nBunchTiles: 60, nBagTiles: 3 })
  })
})

describe('bananagrams makeGameData — the seat rule', () => {
  const board = ZTest_across(emptyBoard(), 10, 12, 'banana')
  const racing = [
    { id: 'u1', username: 'me', color: 'red', tiles: 'bananagr', board },
    { id: 'u2', username: 'moth', color: 'blue', tiles: 'setupxyz' },
  ]

  it('my own letters are mine to see', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: racing }), 'u1')
    expect(gd.me.tiles).toBe('bananagr')
    expect(gd.me.board.letters).toBe(board)
  })

  it('a rival\'s tiles and board are withheld mid-race; their counts are not', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: racing }), 'u1')
    const moth = gd.playersById.u2!
    expect(moth.tiles).toBeNull()
    expect(moth.board).toBeNull()
    expect(moth.nTiles).toBe(8)
    expect(moth.nUnplacedTiles).toBe(8)
  })

  it('the count is the letters held less the board\'s main block', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: racing }), 'u2')
    // "banana" is six placed of eight held.
    expect(gd.playersById.u1!.nUnplacedTiles).toBe(2)
  })

  it('a conceded rival keeps their counts too', () => {
    const conceded = [racing[0]!, { ...racing[1]!, ...ZTest_CONCEDED }]
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: conceded }), 'u1')
    const moth = gd.playersById.u2!
    expect(moth.conceded).toBe(true)
    expect(moth.tiles).toBeNull()
    expect(moth.nTiles).toBe(8)
  })

  it('at the end every seat shows everything', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: racing,
        ending: { reason: 'reached_goal', detail: 'complete', by: 'u1', winner: 'u1' },
        outcome: 'won',
      }),
      'u1',
    )
    const moth = gd.playersById.u2!
    expect(moth.tiles).toBe('setupxyz')
    expect(moth.board?.letters).toBe(emptyBoard())
  })
})

describe('bananagrams useGame', () => {
  it('hands back gd for the page\'s blob', () => {
    const ctx = ZTest_makeBananagramsCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.players).toHaveLength(2)
  })

  it('throws when the builder has not written a blob yet', () => {
    const ctx = { ...ZTest_makeBananagramsCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
