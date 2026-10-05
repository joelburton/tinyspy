// cs-unmet

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players and tiles, the setup rows built, each
 * seat's facts carried through — and the seat rule, which is the one thing the
 * blob does not carry: a rival's rows, board, bar and found-word count are
 * withheld mid-race and nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_find,
  ZTest_guess,
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_makeStrandsCtx,
  ZTest_rowIds,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** I find row 0; moth finds a hint word, misses, and cashes a hint that rings
 *  row 2. */
const EVENTS = [
  ZTest_find(1, 'u1', 0),
  ZTest_guess(2, 'u2', ZTest_rowIds(1, 4), 'hint_word'),
  ZTest_guess(3, 'u2', ZTest_rowIds(5, 4), 'invalid'),
  ZTest_hint(4, 'u2', ZTest_rowIds(2)),
]
const STOPPED = { ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' } as const

describe('strands makeGameData — the links become players and tiles', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('a free-for-all game has no turns; a turn game names its holder', () => {
    expect(makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1').turns).toBeNull()
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, turnHolderId: 'u2' }), 'u1')
    expect(gd.turns?.holder).toBe(gd.playersById.u2)
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: TWO,
        ending: { reason: 'conceded', detail: 'conceded', by: 'u2', winner: 'u1' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.me)
    expect(gd.ended).toBe(true)
  })

  it('a timeout is ended by nobody', () => {
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

  it('gives each log row its player, and its tiles in trace order', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    const [find, hintWord, miss, hint] = gd.events
    expect(find!.by).toBe(gd.me)
    expect(hint!.by).toBe(gd.playersById.u2)
    expect(find).not.toHaveProperty('userId')
    expect(find).not.toHaveProperty('tileIds')
    expect(find!.tiles.map((t) => t.letter).join('')).toBe('zzqabc')
    expect(find!.tiles[0]).toBe(gd.puzzle.tilesById['0,0'])
    expect(hintWord).toMatchObject({ kind: 'guess', word: 'zzqb', result: 'hint_word', tookTurn: true })
    expect(miss).toMatchObject({ word: 'zzqf', result: 'invalid', tookTurn: false })
    expect(hint).toMatchObject({ kind: 'hint', word: null, result: null, tookTurn: false })
    expect(hint!.tiles.map((t) => t.id)).toEqual(ZTest_rowIds(2))
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('hint_cost')
  })
})

describe('strands makeGameData — the puzzle', () => {
  it('keys the tiles by their place', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.tiles).toHaveLength(48)
    expect(gd.puzzle.tilesById['7,5']).toBe(gd.puzzle.tiles[47])
    expect(gd.puzzle.tilesById['7,5']).toEqual({ id: '7,5', letter: 'r', row: 7, col: 5 })
    expect(gd.puzzle.title).toBe('Rows of nonsense')
  })

  it('no words mid-game', () => {
    expect(makeGameData(ZTest_makeGameDataRaw(), 'u1').puzzle.words).toBeNull()
  })

  it('hands the words over once the game has ended, spangram first, as tiles', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ ...STOPPED }), 'u1')
    expect(gd.puzzle.words).toHaveLength(8)
    expect(gd.puzzle.words![0]).toMatchObject({ word: 'zzqejk', spangram: true })
    expect(gd.puzzle.words![0]!.tiles[0]).toBe(gd.puzzle.tilesById['4,0'])
  })
})

describe('strands makeGameData — coop: one board, one bar', () => {
  const coop = () => makeGameData(
    ZTest_makeGameDataRaw({ players: TWO, events: EVENTS, hintPoints: 1, hintTileIds: ZTest_rowIds(2) }),
    'u1',
  )

  it('each player\'s counts are their own, and the team sums them', () => {
    const gd = coop()
    expect([gd.me.nFoundWords, gd.me.nHintsUsed]).toEqual([1, 0])
    const moth = gd.playersById.u2!
    expect([moth.nFoundWords, moth.nHintsUsed]).toEqual([0, 1])
    expect(gd.team).toEqual({ nFoundWords: 1, nHintsUsed: 1, hintPoints: 1 })
  })

  it('the bar is the team\'s: no player carries one', () => {
    const gd = coop()
    expect(gd.me.hintPoints).toBeNull()
    expect(gd.hintBarData).toEqual({ hintPoints: 1, hintCost: 3 })
  })

  it('the state line shows the team\'s counts', () => {
    expect(coop().stateLineData).toEqual({ nFoundWords: 1, nHintsUsed: 1 })
  })

  it('one board — the finds and the ring — on every seat', () => {
    const gd = coop()
    expect(gd.me.board.words.map((w) => w.word)).toEqual(['zzqabc'])
    expect(gd.me.board.hintTiles?.map((t) => t.id)).toEqual(ZTest_rowIds(2))
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
  })
})

describe('strands makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({
    mode: 'compete',
    players: [
      { ...TWO[0]!, hintPoints: 1 },
      { ...TWO[1]!, hintPoints: 2, hintTileIds: ZTest_rowIds(3) },
    ],
    events: [
      ZTest_find(1, 'u1', 0),
      ZTest_find(2, 'u2', 0),
      ZTest_find(3, 'u2', 1),
      ZTest_hint(4, 'u2', ZTest_rowIds(3)),
    ],
    ...over,
  })

  it('mid-race, a rival\'s rows leave the log, and their board, bar and count are withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    const moth = gd.playersById.u2!
    expect(moth.board).toBeNull()
    expect(moth.hintPoints).toBeNull()
    expect(moth.nFoundWords).toBeNull()
  })

  it('a rival\'s hints used stay visible mid-race — the race publishes them', () => {
    expect(makeGameData(race(), 'u1').playersById.u2!.nHintsUsed).toBe(1)
  })

  it('my own board, bar and count are always mine to see', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.me.board.words.map((w) => w.word)).toEqual(['zzqabc'])
    expect(gd.me.board.hintTiles).toBeNull()
    expect(gd.me.nFoundWords).toBe(1)
    expect(gd.hintBarData).toEqual({ hintPoints: 1, hintCost: 3 })
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(race({ ...STOPPED }), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1, 2, 3, 4])
    const moth = gd.playersById.u2!
    expect(moth.board?.words).toHaveLength(2)
    expect(moth.board?.hintTiles?.map((t) => t.id)).toEqual(ZTest_rowIds(3))
    expect([moth.nFoundWords, moth.hintPoints]).toEqual([2, 2])
  })

  it('a race has no team, so the state line shows my own counts', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.team).toBeNull()
    expect(gd.stateLineData).toEqual({ nFoundWords: 1, nHintsUsed: 0 })
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('strands useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeStrandsCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeStrandsCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeStrandsCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(4)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeStrandsCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
