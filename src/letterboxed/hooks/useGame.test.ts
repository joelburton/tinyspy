// cs-unmet

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, the word list flagged, the setup
 * rows built, each seat's facts carried through — and the seat rule, which is
 * the one thing the blob does not carry: a rival's rows and chain are withheld
 * mid-race and nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_event,
  ZTest_makeGameDataRaw,
  ZTest_makeLetterboxedCtx,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** I play ADG; moth takes a hint, then plays GJB. */
const EVENTS = [
  ZTest_event(1, 'u1', 'word', 'adg', 3),
  ZTest_event(2, 'u2', 'hint', 'gjb', 3),
  ZTest_event(3, 'u2', 'word', 'gjb', 5),
]

describe('letterboxed makeGameData — the links become players', () => {
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
    expect(gd.events[2]!.by).toBe(gd.playersById.u2)
    expect(gd.events[0]).not.toHaveProperty('userId')
    expect(gd.events[1]).toMatchObject({ kind: 'hint', word: 'gjb', nCoveredLetters: 3, tookTurn: false })
  })

  it('builds the setup rows once, with the board, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.find((r) => r.key === 'extra_words')?.value).toBe('par + 3 (5 words)')
    expect(gd.setupRows.find((r) => r.label === 'Board')?.value).toBe('ABC-DEF-GHI-JKL')
  })
})

describe('letterboxed makeGameData — the puzzle', () => {
  it('flags every accepted word for whether a hint may offer it', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.words).toHaveLength(8)
    expect(gd.puzzle.words.find((w) => w.word === 'ila')).toEqual({ word: 'ila', clean: false })
    expect(gd.puzzle.words.find((w) => w.word === 'qat')).toEqual({ word: 'qat', clean: true })
    expect(gd.puzzle).not.toHaveProperty('uncleanWords')
  })

  it('keys the tiles by their letter', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.tiles).toHaveLength(12)
    expect(gd.puzzle.tilesById.e).toBe(gd.puzzle.tiles[4])
    expect(gd.puzzle.tilesById.e).toEqual({ id: 'e', letter: 'e', side: 1 })
  })

  it('carries par, and no solution mid-game', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.nParWords).toBe(2)
    expect(gd.puzzle.solution).toBeNull()
  })

  it('hands the solution over once the game has ended', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
        outcome: 'neutral',
      }),
      'u1',
    )
    expect(gd.puzzle.solution).toEqual(['adgjbehk', 'kcfil'])
  })
})

describe('letterboxed makeGameData — the counts', () => {
  it('coop: the chain and its counts are the team\'s, on every player and under `own`', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({ players: TWO, chain: ['adg', 'gjb'], events: EVENTS }),
      'u1',
    )
    expect([gd.me.nWordsUsed, gd.me.nCoveredLetters]).toEqual([2, 5])
    expect([gd.me.own.nWordsUsed, gd.me.own.nCoveredLetters]).toEqual([2, 5])
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
    expect(gd.me.own.board).toBe(gd.me.board)
    expect(gd).not.toHaveProperty('team')
  })

  it('coop: the hints and spoilers on a player are the team\'s; their own are under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect([gd.me.nHintsUsed, gd.playersById.u2!.nHintsUsed]).toEqual([1, 1])
    expect([gd.me.own.nHintsUsed, gd.playersById.u2!.own.nHintsUsed]).toEqual([0, 1])
    expect(gd.me.own.nSpoilersUsed).toBe(0)
  })

  it('carries the cap and the rest through from the blob', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ maxWords: 7 }), 'u1')
    expect(gd.me.maxWords).toBe(7)
    expect(gd.brand).toBe('SnakeBox')
  })
})

describe('letterboxed makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({
    mode: 'compete',
    players: [{ ...TWO[0]!, chain: ['adg'] }, { ...TWO[1]!, chain: ['gjb', 'beh'] }],
    events: [ZTest_event(1, 'u1', 'word', 'adg', 3), ZTest_event(2, 'u2', 'word', 'gjb', 3)],
    ...over,
  })

  it('mid-race, a rival\'s rows leave the log and their chain is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.words).toEqual(['adg'])
  })

  it('a rival\'s two counts stay visible mid-race — the race publishes them', () => {
    const gd = makeGameData(race(), 'u1')
    expect([gd.playersById.u2!.nWordsUsed, gd.playersById.u2!.nCoveredLetters]).toEqual([2, 5])
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1' }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2])
    expect(gd.playersById.u2!.board).toEqual({ words: ['gjb', 'beh'] })
  })

  it('coop withholds nothing: one chain, one team', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, chain: ['adg'], events: EVENTS }), 'u1')
    expect(gd.events).toHaveLength(3)
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
  })

  it('a racer\'s side is themselves, so both copies are their own chain', () => {
    const gd = makeGameData(race(), 'u1')
    expect([gd.me.nCoveredLetters, gd.me.nWordsUsed]).toEqual([3, 1])
    expect([gd.me.own.nCoveredLetters, gd.me.own.nWordsUsed]).toEqual([3, 1])
    expect(gd.me.own.board).toBe(gd.me.board)
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('letterboxed useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeLetterboxedCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeLetterboxedCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeLetterboxedCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(3)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeLetterboxedCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
