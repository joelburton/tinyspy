// cs-unmet

import { describe, expect, it } from 'vitest'
import { answerMessage, eventToOutcome } from './answer'

describe('answerMessage', () => {
  it('reads every answer in its own words and outcome', () => {
    expect(answerMessage({ answerType: 'submitted' })).toEqual({ outcome: 'neutral', text: 'Your word is in' })
    expect(answerMessage({ answerType: 'not_a_word' }))
      .toEqual({ outcome: 'lost', text: 'Not a word at this dictionary' })
    expect(answerMessage({ answerType: 'already_played', earlier: 'fish' }))
      .toEqual({ outcome: 'warning', text: 'Already played: FISH' })
    expect(answerMessage({ answerType: 'first_in_peer' }))
      .toEqual({ outcome: 'warning', text: 'submitted — 30 seconds' })
    expect(answerMessage({ answerType: 'no_word' })).toEqual({ outcome: 'warning', text: 'no word' })
  })
})

describe('eventToOutcome', () => {
  it('no word is the warning, the same one answerMessage gives it', () => {
    expect(eventToOutcome({ word: '', bonus: 0 })).toBe(answerMessage({ answerType: 'no_word' }).outcome)
  })

  it('a word that earned a bonus is won; any other word is neutral', () => {
    expect(eventToOutcome({ word: 'dragon', bonus: 2 })).toBe('won')
    expect(eventToOutcome({ word: 'dragon', bonus: 0 })).toBe('neutral')
  })
})
