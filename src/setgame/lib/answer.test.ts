// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome } from './answer'

/**
 * setgame's one outcome decision. `submit_set` answers no outcome — what a
 * claim reads as is decided here alone.
 */
describe('answerMessage', () => {
  it('gives each answer its outcome and words', () => {
    expect(answerMessage({ answerType: 'claim' })).toEqual({ outcome: 'won', text: '' })
    expect(answerMessage({ answerType: 'claim_peer' })).toEqual({ outcome: 'won', text: 'found a set' })
    expect(answerMessage({ answerType: 'hint' })).toEqual({ outcome: 'warning', text: '' })
    expect(answerMessage({ answerType: 'not_a_set' })).toEqual({ outcome: 'lost', text: 'Not a set' })
  })
})

describe('eventToOutcome', () => {
  it('colors a logged claim won and a logged hint as a hint', () => {
    expect(eventToOutcome({ kind: 'claim' })).toBe('won')
    expect(eventToOutcome({ kind: 'hint' })).toBe('warning')
  })
})
