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
import { ZTest_CONCEDED, ZTest_guess, ZTest_makeGameDataRaw, ZTest_makeWordleCtx } from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2); each has guessed once. */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const EVENTS = [ZTest_guess(1, 'u1', 'crane', 'xygxx'), ZTest_guess(2, 'u2', 'slate', 'xxxgx')]

describe('wordle makeGameData — the links become players', () => {
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
        players: [TWO[0], { ...TWO[1], outcome: 'won', finalRanking: 1 }],
        ending: { reason: 'reached_goal', detail: 'solved', by: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winners).toEqual([gd.playersById.u2])
    expect(gd.ended).toBe(true)
  })

  it('a timeout nobody\'s turn covers ended by nobody', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: TWO,
        ending: { reason: 'timeout', detail: 'timeout', by: null },
        outcome: 'lost',
      }),
      'u1',
    )
    expect(gd.ending).toEqual({ reason: 'timeout', detail: 'timeout', by: null, winners: [] })
  })

  it('gives each log row its player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events[0]!.by).toBe(gd.me)
    expect(gd.events[1]!.by).toBe(gd.playersById.u2)
    expect(gd.events[0]).not.toHaveProperty('userId')
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('max_guesses')
  })

  it('carries the target, the counts, the tie-break and the rest through from the blob', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: [TWO[0]!, { ...TWO[1]!, tieBrokenByClock: true }],
        events: EVENTS,
        target: null,
      }),
      'u1',
    )
    expect(gd.puzzle.target).toBeNull()
    // The team's two guesses on every player; my own one under `own`.
    expect([gd.me.nGuessesUsed, gd.me.maxGuesses]).toEqual([2, 6])
    expect(gd.playersById.u2!.nGuessesUsed).toBe(2)
    expect([gd.me.own.nGuessesUsed, gd.playersById.u2!.own.nGuessesUsed]).toEqual([1, 1])
    expect(gd).not.toHaveProperty('team')
    expect(gd.me.tieBrokenByClock).toBeNull()
    expect(gd.playersById.u2!.tieBrokenByClock).toBe(true)
    expect(gd.brand).toBe('WordNerd')
  })

  it('hands the target over once the game has ended', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        target: 'crane',
        ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
        outcome: 'neutral',
      }),
      'u1',
    )
    expect(gd.puzzle.target).toBe('crane')
  })
})

describe('wordle makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS, ...over })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.rows).toEqual([{ word: 'crane', colors: 'xygxx' }])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1' }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2])
    expect(gd.playersById.u2!.board!.rows).toEqual([{ word: 'slate', colors: 'xxxgx' }])
  })

  it('coop withholds nothing: one board, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(2)
    // The one board, the same object on every player and under `own`.
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
    expect(gd.me.own.board).toBe(gd.me.board)
    expect(gd.me.board.rows).toHaveLength(2)
  })

  it('a rival\'s count stays visible mid-race — the strip shows it', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.playersById.u2!.nGuessesUsed).toBe(1)
  })

  it('a racer\'s side is themselves, so both copies are their own', () => {
    const gd = makeGameData(race(), 'u1')
    expect([gd.me.nGuessesUsed, gd.me.own.nGuessesUsed]).toEqual([1, 1])
    expect(gd.me.own.board).toBe(gd.me.board)
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('wordle useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeWordleCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeWordleCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeWordleCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(2)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeWordleCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
