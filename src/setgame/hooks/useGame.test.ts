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
    expect(gd.board.tiles).toHaveLength(12)
    for (const tile of gd.board.tiles) expect(gd.board.tilesById[tile.id]).toBe(tile)
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

  it('draws the state line from the team in coop', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      nTilesInDeck: 57,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113']), ZTest_hint(2, 'u1', ['1121'])],
    }), 'u1')
    expect(gd.stateLineData).toEqual({ nSetsFound: 1, nTilesInDeck: 57, nHintsUsed: 1 })
  })

  it('draws the state line from my own count in a race, with no hints', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      nTilesInDeck: 57,
      events: [ZTest_claim(1, 'u2', ['1111', '1112', '1113'])],
    }), 'u1')
    expect(gd.stateLineData).toEqual({ nSetsFound: 0, nTilesInDeck: 57, nHintsUsed: null })
  })

  it('turns the ending\'s links into players', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      ending: { reason: 'resource_exhausted', detail: 'cleared', by: 'u2', winner: 'u2' },
      outcome: 'won',
    }), 'u1')
    expect(gd.ending!.by).toBe(gd.playersById.u2)
    expect(gd.ending!.winner).toBe(gd.playersById.u2)
  })
})
