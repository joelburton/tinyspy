// cs-fixed-psychicnum

/**
 * WHAT THE PLAYAREA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the boards into maps, the setup
 * rows built — and the seat rule, which is the one thing the blob does not
 * carry: a rival's rows and board are withheld mid-race and nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZTest_CONCEDED, ZTest_guess, ZTest_makeGameDataRaw, ZTest_makePsychicnumCtx } from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2); each has guessed once. */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const EVENTS = [ZTest_guess(1, 'u1', 'alpha', true), ZTest_guess(2, 'u2', 'bravo', false)]

describe('psychicnum makeGameData — the links become players', () => {
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
        players: [TWO[0]!, { ...TWO[1]!, outcome: 'won', finalRanking: 1 }],
        ending: { reason: 'reached_goal', detail: 'solved', by: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winners).toEqual([gd.playersById.u2])
    expect(gd.ending?.winners[0]).toBe(gd.playersById.u2)
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

  it('gives each tile its outcome, read once, and its decider as a player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.me.board.tiles.map((t) => [t.word, t.correct, t.outcome])).toEqual([
      ['alpha', true, 'won'], ['bravo', false, 'lost'], ['charlie', null, null], ['delta', null, null], ['echo', null, null],
    ])
    expect(gd.me.board.tiles[0]!.decidedBy).toBe(gd.me)
    expect(gd.me.board.tiles[1]!.decidedBy).toBe(gd.playersById.u2)
    expect(gd.me.board.tiles[2]!.decidedBy).toBeNull()
    // The same objects by id, for a hook that holds an id.
    expect(gd.me.board.tiles[0]!.id).toBe('alpha')
    expect(gd.me.board.tilesById.get('alpha')).toBe(gd.me.board.tiles[0])
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('max_guesses')
  })

  it('carries the puzzle, the counts and the rest through from the blob', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS, secrets: null }), 'u1')
    expect(gd.puzzle.words).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo'])
    expect(gd.puzzle.secrets).toBeNull()
    expect(gd.brand).toBe('PsychicNum')
    expect(gd).not.toHaveProperty('team')
  })
})

describe('psychicnum makeGameData — the facts, the side\'s and my own', () => {
  it('coop: every player carries the team\'s facts, and their own under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    // The team's two guesses with the one find, against the secrets and the budget.
    expect([gd.me.nFoundSecrets, gd.me.nReqdSecrets, gd.me.nGuessesUsed, gd.me.maxGuesses]).toEqual([1, 3, 2, 7])
    expect([gd.playersById.u2!.nFoundSecrets, gd.playersById.u2!.nGuessesUsed]).toEqual([1, 2])
    // My own hit and my one guess; bea's one miss.
    expect([gd.me.own.nFoundSecrets, gd.me.own.nGuessesUsed]).toEqual([1, 1])
    expect([gd.playersById.u2!.own.nFoundSecrets, gd.playersById.u2!.own.nGuessesUsed]).toEqual([0, 1])
  })

  it('coop: the one board is the same object on every player, and under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
    expect(gd.me.own.board).toBe(gd.me.board)
  })

  it('compete: a racer\'s side is themselves, so both copies are their own', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS }), 'u1')
    expect([gd.me.nFoundSecrets, gd.me.nGuessesUsed]).toEqual([1, 1])
    expect([gd.me.own.nFoundSecrets, gd.me.own.nGuessesUsed]).toEqual([1, 1])
    expect(gd.me.own.board).toBe(gd.me.board)
  })
})

describe('psychicnum makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS, ...over })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.tiles.filter((t) => t.correct !== null).map((t) => t.word)).toEqual(['alpha'])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1' }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2])
    expect(gd.playersById.u2!.board!.tiles.filter((t) => t.correct !== null).map((t) => t.word)).toEqual(['bravo'])
  })

  it('coop withholds nothing: one board, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(2)
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
  })

  it('a rival\'s counts stay visible mid-race — the strip shows them', () => {
    const gd = makeGameData(race(), 'u1')
    expect([gd.playersById.u2!.nFoundSecrets, gd.playersById.u2!.nGuessesUsed]).toEqual([0, 1])
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('psychicnum useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makePsychicnumCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makePsychicnumCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makePsychicnumCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(2)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makePsychicnumCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
