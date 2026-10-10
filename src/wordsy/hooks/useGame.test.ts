// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from './useGame'
import { ZTest_makeGameDataRaw, ZTest_TWO, ZTest_word } from '../lib/gameData.fixture'

describe('makeGameData', () => {
  it('turns the round links into players, and keys each round\'s cards', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      rounds: [{ num: 1, ended: true, fastest: 'u2' }, { num: 2, fastest: 'u1', noFlipHolder: 'u2' }],
    }), 'u1')
    expect(gd.rounds[0]!.fastest).toBe(gd.playersById.u2)
    expect(gd.rounds[1]!.noFlipHolder).toBe(gd.playersById.u2)
    expect(gd.rounds[1]!.tilesById['58']!.letter).toBe('q')
  })

  it('`round` is the last of `rounds`, the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ rounds: [{ num: 1, ended: true }, { num: 2 }] }), 'u1')
    expect(gd.round).toBe(gd.rounds[1])
  })

  it('the seat rule: a rival\'s standing word is dropped, mine kept, and both still say they are in', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: [{ ...ZTest_TWO[0]!, word: 'dragon' }, { ...ZTest_TWO[1]!, word: 'cab' }],
    }), 'u1')
    expect(gd.me.word).toBe('dragon')
    expect(gd.playersById.u2!.word).toBeNull()
    expect(gd.playersById.u2!.own.word).toBeNull()
    expect(gd.playersById.u2!.hasSubmitted).toBe(true)
  })

  it('isWordFrozen is the Fastest\'s alone, as the blob says', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      rounds: [{ num: 1, fastest: 'u2', isTimerRunning: true }],
      players: [{ ...ZTest_TWO[0]!, word: 'dragon' }, { ...ZTest_TWO[1]!, word: 'cab', isWordFrozen: true }],
    }), 'u1')
    expect(gd.me.isWordFrozen).toBe(false)
    expect(gd.playersById.u2!.isWordFrozen).toBe(true)
  })

  it('a log row\'s player is the player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ events: [ZTest_word(1, 'u2', 1, 'cab', 9)] }), 'u1')
    expect(gd.events[0]!.by).toBe(gd.playersById.u2)
  })

  it('the facts are the same spread on and under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: [{ ...ZTest_TWO[0]!, total: 24, nBonuses: 2 }, ZTest_TWO[1]!],
    }), 'u1')
    expect(gd.me.total).toBe(24)
    expect(gd.me.own.total).toBe(24)
    expect(gd.me.nBonuses).toBe(2)
  })
})
