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
import { CONCEDED, guess, makeGameDataRaw, makePsychicnumCtx } from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2); each has guessed once. */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const EVENTS = [guess(1, 'u1', 'alpha', true), guess(2, 'u2', 'bravo', false)]

describe('psychicnum makeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('names the turn holder as a player', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO, turnHolderId: 'u2' }), 'u1')
    expect(gd.turns?.holder).toBe(gd.playersById.u2)
  })

  it('a free-for-all game has no turns', () => {
    expect(makeGameData(makeGameDataRaw({ players: TWO }), 'u1').turns).toBeNull()
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(
      makeGameDataRaw({
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
      makeGameDataRaw({
        players: TWO,
        ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
        outcome: 'lost',
      }),
      'u1',
    )
    expect(gd.ending).toEqual({ reason: 'timeout', detail: 'timeout', by: null, winner: null })
  })

  it('gives each log row its player', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events[0]!.by).toBe(gd.me)
    expect(gd.events[1]!.by).toBe(gd.playersById.u2)
    expect(gd.events[0]).not.toHaveProperty('userId')
  })

  it('turns a board into maps, with the deciders as players', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect([...gd.me.board.tileResults]).toEqual([['alpha', true], ['bravo', false]])
    expect(gd.me.board.decidedBy.get('bravo')).toBe(gd.playersById.u2)
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('max_guesses')
  })

  it('carries the puzzle, the counts and the rest through from the blob', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO, events: EVENTS, secrets: null }), 'u1')
    expect(gd.puzzle.words).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo'])
    expect(gd.puzzle.secrets).toBeNull()
    // My own hit and my one guess; the team's two guesses with the one find.
    expect([gd.me.foundSecretsCount, gd.me.guessesUsed]).toEqual([1, 1])
    expect(gd.team).toEqual({ foundSecretsCount: 1, guessesUsed: 2 })
    expect(gd.brand).toBe('PsychicNum')
  })

  it('a race has no team', () => {
    const gd = makeGameData(makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS }), 'u1')
    expect(gd.team).toBeNull()
  })
})

describe('psychicnum makeGameData — the seat rule', () => {
  const race = (over = {}) => makeGameDataRaw({ mode: 'compete', players: TWO, events: EVENTS, ...over })

  it('mid-race, a rival\'s rows leave the log and their board is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect([...gd.me.board.tileResults]).toEqual([['alpha', true]])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2])
    expect([...gd.playersById.u2!.board!.tileResults]).toEqual([['bravo', false]])
  })

  it('coop withholds nothing: one board, one team', () => {
    const gd = makeGameData(makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(2)
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
  })

  it('a rival\'s counts stay visible mid-race — the strip shows them', () => {
    const gd = makeGameData(race(), 'u1')
    expect([gd.playersById.u2!.foundSecretsCount, gd.playersById.u2!.guessesUsed]).toEqual([0, 1])
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('psychicnum useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = makePsychicnumCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = makePsychicnumCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(makePsychicnumCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(2)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...makePsychicnumCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
