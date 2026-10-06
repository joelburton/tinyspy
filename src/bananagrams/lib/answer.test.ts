// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { answerMessage, answerOfEvent } from './answer'
import { ZTest_dump, ZTest_makeGameDataRaw, ZTest_peel, ZTest_wentOut } from './gameData.fixture'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

describe('answerMessage', () => {
  it('a peel and a dump are draws, not verdicts', () => {
    expect(answerMessage({ answerType: 'peel' })).toEqual({ outcome: 'neutral', text: '🍌 Peel!' })
    expect(answerMessage({ answerType: 'peel_peer' })).toEqual({ outcome: 'neutral', text: 'peeled' })
    expect(answerMessage({ answerType: 'dump', tile: 'q' })).toEqual({ outcome: 'neutral', text: 'Dumped Q' })
  })

  it('going out says nothing here; the ending does', () => {
    expect(answerMessage({ answerType: 'went_out' })).toEqual({ outcome: 'neutral', text: '' })
  })

  it('a blocked peel is the move going wrong', () => {
    expect(answerMessage({ answerType: 'peel_invalid' }).outcome).toBe('lost')
  })

  it('a check reads its red cells', () => {
    expect(answerMessage({ answerType: 'check_clean' }))
      .toEqual({ outcome: 'won', text: 'Every word checks out, and the grid is one piece.' })
    expect(answerMessage({ answerType: 'check_empty' }))
      .toEqual({ outcome: 'noted', text: 'Nothing on the board to check yet.' })
    expect(answerMessage({ answerType: 'check_invalid', nTiles: 1 }).text)
      .toBe('1 tile highlighted — either not a real word, or not joined to the grid.')
    expect(answerMessage({ answerType: 'check_invalid', nTiles: 3 }).text)
      .toBe('3 tiles highlighted — either not a real word, or not joined to the grid.')
  })
})

describe('answerOfEvent', () => {
  it('reads every kind of row, a peel from where I sit', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: TWO,
      events: [ZTest_peel(1, 'u1'), ZTest_peel(2, 'u2'), ZTest_dump(3, 'u2', 'q'), ZTest_wentOut(4, 'u2')],
    }), 'u1')
    expect(gd.events.map((e) => answerOfEvent(e, gd.me))).toEqual([
      { answerType: 'peel' },
      { answerType: 'peel_peer' },
      { answerType: 'dump', tile: 'q' },
      { answerType: 'went_out' },
    ])
  })
})
