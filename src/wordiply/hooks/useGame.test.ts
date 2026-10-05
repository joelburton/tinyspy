// cs-unmet

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the setup rows built, each seat's
 * facts carried through, the state line's pick — and the seat rule, which is
 * the one thing the blob does not carry: a rival's rows and board are withheld
 * mid-race and nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_guess,
  ZTest_makeGameDataRaw,
  ZTest_makeWordiplyCtx,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** I land 'cars', moth tries a word the list lacks, then lands 'hangars'. */
const EVENTS = [
  ZTest_guess(1, 'u1', 'cars'),
  ZTest_guess(2, 'u2', 'arqq', 'not_a_word'),
  ZTest_guess(3, 'u2', 'hangars'),
]
const STOPPED = {
  ending: { reason: 'stopped' as const, detail: 'stopped', by: 'u1', winner: null },
  outcome: 'neutral' as const,
}

describe('wordiply makeGameData — the links become players', () => {
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
        ending: { reason: 'conceded', detail: 'conceded', by: 'u1', winner: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.me)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
    expect(gd.ended).toBe(true)
  })

  it('a timeout nobody\'s turn covers is ended by nobody', () => {
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

  it('gives each log row its player, rejects included', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events.map((e) => e.by)).toEqual([gd.me, gd.playersById.u2, gd.playersById.u2])
    expect(gd.events[1]).toMatchObject({ word: 'arqq', valid: false, reason: 'not_a_word', tookTurn: false })
    expect(gd.events[0]).not.toHaveProperty('userId')
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('difficulty')
  })

  it('carries the puzzle through from the blob, whole from the start', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle).toMatchObject({ base: 'ar', maxWordLen: 7, longestWords: ['hangars'] })
    expect(gd.brand).toBe('WordWire')
  })
})

describe('wordiply makeGameData — the tracks and the state line', () => {
  it('coop: each player\'s count is their own, the team\'s is everyone\'s, and the state line shows the team\'s', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect([gd.me.nGuessesUsed, gd.playersById.u2!.nGuessesUsed]).toEqual([1, 1])
    expect(gd.team).toEqual({ nGuessesUsed: 2, lengthScore: null, nLetters: null, longestWordLen: null })
    expect(gd.stateLineData).toEqual({
      nGuessesUsed: 2, lengthScore: null, nLetters: null, longestWordLen: null, maxGuesses: 5, maxWordLen: 7,
    })
  })

  it('the scores arrive once the game has ended', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS, ...STOPPED }), 'u1')
    // cars (4) + hangars (7): 11 letters, the longest 7 of 7.
    expect(gd.stateLineData).toMatchObject({ nGuessesUsed: 2, lengthScore: 100, nLetters: 11, longestWordLen: 7 })
    expect(gd.me).toMatchObject({ lengthScore: 57, nLetters: 4, longestWordLen: 4 })
  })

  it('a race has no team, so the state line shows my own track', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS }),
      'u1',
    )
    expect(gd.team).toBeNull()
    expect(gd.stateLineData).toMatchObject({ nGuessesUsed: 1, maxGuesses: 5 })
  })
})

describe('wordiply makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS, ...over })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.words).toEqual(['cars'])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(race(STOPPED), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1, 2, 3])
    expect(gd.playersById.u2!.board!.words).toEqual(['hangars'])
  })

  it('coop withholds nothing: one board, the team\'s accepted words', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(3)
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
    expect(gd.me.board.words).toEqual(['cars', 'hangars'])
  })

  it('a rival\'s count stays visible mid-race — the strip shows it', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.playersById.u2!.nGuessesUsed).toBe(1)
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('wordiply useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeWordiplyCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeWordiplyCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeWordiplyCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(3)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeWordiplyCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
