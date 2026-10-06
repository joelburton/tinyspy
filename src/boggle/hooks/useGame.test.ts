// cs-unmet

/**
 * WHAT THE PLAYAREA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the tiles into a map, the setup
 * rows built, the state line decided — and the seat rule, which is the one
 * thing the blob does not carry: a rival's finds are withheld mid-race and
 * nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BOARD_KEY } from '@/common/setup-form/setupRows'
import { ZTest_CONCEDED, ZTest_find, ZTest_makeBoggleCtx, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** I find a required word; moth a required one and a bonus one. */
const FINDS = [
  ZTest_find('u1', 'cat', 1),
  ZTest_find('u2', 'scare', 2),
  ZTest_find('u2', 'scat', 1, { bonus: true }),
]

describe('boggle makeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('gives each find its player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, foundWords: FINDS }), 'u1')
    expect(gd.foundWords.map((w) => `${w.by.username}:${w.word}`)).toEqual(['me:cat', 'moth:scare', 'moth:scat'])
    expect(gd.foundWords[0]!.by).toBe(gd.me)
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: TWO,
        ending: { reason: 'reached_goal', detail: 'target', by: 'u2', winner: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
  })

  it('looks a tile up by its id', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ letters: ['c', 'qu', null, 't'] }), 'u1')
    expect(gd.puzzle.tilesById.get('1')).toEqual({ id: '1', letters: 'qu' })
    expect(gd.puzzle.tilesById.get('2')).toEqual({ id: '2', letters: null })
  })

  it('builds the setup rows once, the board written as the setup field takes it back', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ letters: ['c', 'qu', null, 't'] }), 'u1')
    expect(gd.setupRows.find((r) => r.key === BOARD_KEY)?.value).toBe('CQu-?T')
  })

  it("coop: every player carries the team's finds, and their own under `own`", () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, foundWords: FINDS }), 'u1')
    expect(gd.me).toMatchObject({
      nFoundReqdWords: 2, foundReqdWordsScore: 3, nFoundBonusWords: 1, foundBonusWordsScore: 1,
    })
    expect(gd.playersById.u2!.nFoundReqdWords).toBe(2)
    expect([gd.me.own.nFoundReqdWords, gd.me.own.nFoundBonusWords]).toEqual([1, 0])
    expect(gd).not.toHaveProperty('team')
  })

  it('a racer\'s side is themselves, so both copies are their own', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, foundWords: FINDS }), 'u1')
    expect([gd.me.nFoundReqdWords, gd.me.nFoundBonusWords]).toEqual([1, 0])
    expect([gd.me.own.nFoundReqdWords, gd.me.own.nFoundBonusWords]).toEqual([1, 0])
  })
})

describe('boggle makeGameData — the seat rule', () => {
  it("mid-race, a rival's finds leave foundWords", () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, foundWords: FINDS }), 'u1')
    expect(gd.foundWords.map((w) => w.word)).toEqual(['cat'])
  })

  it("the race's end opens everything", () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: TWO,
        foundWords: FINDS,
        ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
        outcome: 'neutral',
      }),
      'u1',
    )
    expect(gd.foundWords).toHaveLength(3)
  })

  it('coop withholds nothing: one list, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, foundWords: FINDS }), 'u1')
    expect(gd.foundWords).toHaveLength(3)
  })

  it("a rival's counts stay visible mid-race — the strip shows them", () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, foundWords: FINDS }), 'u1')
    expect(gd.playersById.u2!.foundWordsScore).toBe(3)
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({ mode: 'compete', players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }),
      'u1',
    )
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('boggle useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const { result } = renderHook(() => useGame(ZTest_makeBoggleCtx({ players: TWO })))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeBoggleCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeBoggleCtx({ players: TWO, foundWords: FINDS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.foundWords).toHaveLength(3)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeBoggleCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
