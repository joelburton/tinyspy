// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from './useGame'
import { ZTest_claim, ZTest_hint, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'

const PLAYERS = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'rival', color: 'blue' },
]

describe('makeGameData', () => {
  it('keys the table\'s tiles by id, and they are the table\'s own objects', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    const board = gd.me.board
    expect(board.tiles).toHaveLength(12)
    for (const tile of board.tiles) expect(board.tilesById[tile.id]).toBe(tile)
  })

  it('puts the one table and the deck on every player in both modes, the same object', () => {
    for (const mode of ['coop', 'compete'] as const) {
      const gd = makeGameData(ZTest_makeGameDataRaw({ mode, players: PLAYERS, nTilesInDeck: 57 }), 'u1')
      expect(gd.playersById.u2!.board).toBe(gd.me.board)
      expect(gd.me.own.board).toBe(gd.me.board)
      expect([gd.me.nTilesInDeck, gd.playersById.u2!.nTilesInDeck]).toEqual([57, 57])
      expect(gd).not.toHaveProperty('board')
      expect(gd).not.toHaveProperty('team')
    }
  })

  it('turns every row\'s user into the player, and `me` into my entry', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113']), ZTest_hint(2, 'u1', ['1121'])],
    }), 'u1')
    expect(gd.events.map((e) => e.by)).toEqual([gd.playersById.u2, gd.playersById.u1])
    expect(gd.me).toBe(gd.playersById.u1)
  })

  it('shows every row and count in a race — there is no seat rule', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113'])],
    }), 'u1')
    expect(gd.events).toHaveLength(1)
    expect(gd.playersById.u2!.nSetsFound).toBe(1)
  })

  it('coop: every player carries the team\'s counts, and their own under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113']), ZTest_hint(2, 'u1', ['1121'])],
    }), 'u1')
    expect([gd.me.nSetsFound, gd.me.nHintsUsed]).toEqual([1, 1])
    expect([gd.playersById.u2!.nSetsFound, gd.playersById.u2!.nHintsUsed]).toEqual([1, 1])
    expect([gd.me.own.nSetsFound, gd.me.own.nHintsUsed]).toEqual([0, 1])
    expect([gd.playersById.u2!.own.nSetsFound, gd.playersById.u2!.own.nHintsUsed]).toEqual([1, 0])
  })

  it('a racer\'s side is themselves, so both copies are their own', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113'])],
    }), 'u1')
    expect([gd.me.nSetsFound, gd.me.own.nSetsFound]).toEqual([0, 0])
    expect([gd.playersById.u2!.nSetsFound, gd.playersById.u2!.own.nSetsFound]).toEqual([1, 1])
  })

  it('turns the ending\'s links into players', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: [PLAYERS[0], { ...PLAYERS[1], outcome: 'won', finalRanking: 1 }],
      ending: { reason: 'resource_exhausted', detail: 'cleared', by: 'u2' },
      outcome: 'won',
    }), 'u1')
    expect(gd.ending!.by).toBe(gd.playersById.u2)
    expect(gd.ending!.winners).toEqual([gd.playersById.u2])
  })
})
