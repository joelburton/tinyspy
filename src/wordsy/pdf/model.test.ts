// cs-unmet

/**
 * The wordsy print model: the totals highest first with the winner marked,
 * each FINISHED round's table as one line of cards, and the log's rows with a
 * word's score and bonus, or "— no word".
 */
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_makeGameDataRaw, ZTest_word } from '../lib/gameData.fixture'
import { buildPrintModel } from './model'

/** Round 1 revealed (ELF 9 +2 for me, BOB 5 for bea), round 2 in play. */
const MID_GAME = makeGameData(ZTest_makeGameDataRaw({
  rounds: [{ num: 1, ended: true, fastest: 'u1' }, { num: 2 }],
  events: [ZTest_word(1, 'u1', 1, 'elf', 9, 2), ZTest_word(2, 'u2', 1, 'bob', 5)],
  players: [
    { id: 'u1', username: 'me', color: 'red', total: 11 },
    { id: 'u2', username: 'bea', color: 'blue', total: 5 },
  ],
}), 'u1')

describe('buildPrintModel', () => {
  const model = buildPrintModel({ gd: MID_GAME, date: '1 Jan 2026' })

  it('heads the page with the round in play and my total', () => {
    expect(model.summary).toBe('Round 2 of 7 · 11 pts')
  })

  it('lists the totals highest first, with nobody marked while the game is on', () => {
    expect(model.totals).toEqual([
      { name: 'me', total: 11, won: false },
      { name: 'bea', total: 5, won: false },
    ])
  })

  it('prints each finished round\'s cards in slot order, a rare card with its bonus', () => {
    expect(model.tables).toEqual([{ num: 1, cards: 'F+1 B C D L C Q+2 R' }])
  })

  it('numbers the log by round, a word with its score and bonus', () => {
    expect(model.turns).toEqual([
      { seq: 1, who: 'me', text: 'ELF 9 +2' },
      { seq: 1, who: 'bea', text: 'BOB 5' },
    ])
  })

  it('marks the winner and counts the rounds once the game has ended', () => {
    const ended = makeGameData(ZTest_makeGameDataRaw({
      rounds: [{ num: 1, ended: true, fastest: 'u1' }],
      events: [ZTest_word(1, 'u1', 1, 'elf', 9, 2), ZTest_word(2, 'u2', 1, '', 0)],
      players: [
        { id: 'u1', username: 'me', color: 'red', total: 11, finalRanking: 1 },
        { id: 'u2', username: 'bea', color: 'blue', total: 0 },
      ],
      ending: { reason: 'resource_exhausted', detail: 'rounds_played', by: null },
    }), 'u1')
    const m = buildPrintModel({ gd: ended, date: '1 Jan 2026' })
    expect(m.summary).toBe('1 rounds played')
    expect(m.totals[0]).toEqual({ name: 'me', total: 11, won: true })
    expect(m.turns[1]!.text).toBe('— no word')
  })
})
