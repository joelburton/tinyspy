// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, answerOfEvent, eventToOutcome } from './answer'
import { makeEventText } from './eventText'
import { ZTest_exchange, ZTest_leftovers, ZTest_makeGameDataRaw, ZTest_pass, ZTest_wentOut, ZTest_word } from './gameData.fixture'
import { makeGameData } from '../hooks/useGame'

/** The log's rows as `gd` hands them over, by kind. */
function makeEvents() {
  const seven = ['7,7:b', '8,7:i', '9,7:n', '10,7:g', '11,7:o', '12,7:e', '13,7:s']
  const gd = makeGameData(ZTest_makeGameDataRaw({
    events: [
      ZTest_word(1, 'u1', ['6,7:c', '7,7:a', '8,7:t'], ['cat'], 10),
      ZTest_word(2, 'u1', seven, ['bingoes'], 64),
      ZTest_exchange(3, 'u1', 3),
      ZTest_pass(4, 'u1'),
      ZTest_leftovers(5, 'u1', -7, 3),
      ZTest_wentOut(6, 'u1', 7),
    ],
  }), 'u1')
  return gd.events
}

describe('answerMessage', () => {
  it('a played word scores, in capitals, with the bingo marked', () => {
    expect(answerMessage({ answerType: 'word', words: ['cat', 'at'], score: 10, bingo: false }))
      .toEqual({ outcome: 'won', text: 'CAT · AT +10' })
    expect(answerMessage({ answerType: 'word', words: ['bingoes'], score: 64, bingo: true }))
      .toEqual({ outcome: 'won', text: 'BINGOES +64 🎉' })
  })

  it('a word the dictionary refuses is the move going wrong', () => {
    expect(answerMessage({ answerType: 'invalid', badWords: ['qzx'] }))
      .toEqual({ outcome: 'lost', text: 'No: QZX' })
  })

  it('an exchange and a pass adjudicate nothing; my pass says nothing', () => {
    expect(answerMessage({ answerType: 'exchange', nTiles: 3 })).toEqual({ outcome: 'neutral', text: 'Swapped 3' })
    expect(answerMessage({ answerType: 'pass' })).toEqual({ outcome: 'neutral', text: '' })
  })

  it('an opponent\'s turn reads as what they did', () => {
    expect(answerMessage({ answerType: 'word_peer', words: ['cat', 'at'], score: 10 }))
      .toEqual({ outcome: 'won', text: 'played CAT (+10)' })
    expect(answerMessage({ answerType: 'exchange_peer', nTiles: 3 }))
      .toEqual({ outcome: 'neutral', text: 'exchanged 3 tiles' })
    expect(answerMessage({ answerType: 'pass_peer' })).toEqual({ outcome: 'neutral', text: 'passed' })
  })
})

describe('answerOfEvent', () => {
  it('a full rack laid is a bingo', () => {
    const [cat, bingoes] = makeEvents()
    expect(answerMessage(answerOfEvent(cat)).text).toBe('CAT +10')
    expect(answerMessage(answerOfEvent(bingoes)).text).toBe('BINGOES +64 🎉')
  })
})

describe('eventToOutcome', () => {
  it('colors every kind of row', () => {
    expect(makeEvents().map(eventToOutcome))
      .toEqual(['won', 'won', 'neutral', 'neutral', 'neutral', 'neutral'])
  })
})

describe('makeEventText', () => {
  it('reads every kind of row back in words', () => {
    expect(makeEvents().map(makeEventText)).toEqual([
      '+10 CAT',
      '+64 BINGOES',
      'exchanged 3 tiles',
      'passed',
      '-7 for 3 tiles left',
      '+7 for going out',
    ])
  })
})
