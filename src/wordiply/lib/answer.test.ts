// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, answerOf, eventToOutcome, peerAnswerMessage } from './answer'

/**
 * Everything wordiply says about a guess, how the engine's report becomes one
 * of its answers, and the color a logged row wears — the doc's worked example
 * (docs/outcomes.md → How a game does it).
 *
 * The SQL half is `supabase/tests/wordiply/`: `submit_guess`'s `ok` carries no
 * outcome and no message, because the frontend says all of this.
 */
describe('answerMessage', () => {
  it('reads every answer', () => {
    // My own accepted guess says nothing: the board row is the answer.
    expect(answerMessage({ answerType: 'accepted' })).toEqual({ outcome: 'won', text: '' })
    expect(answerMessage({ answerType: 'accepted_peer', word: 'arcade', length: 6 }))
      .toEqual({ outcome: 'won', text: 'ARCADE (6)' })

    expect(answerMessage({ answerType: 'already_found', word: 'arcade' }))
      .toEqual({ outcome: 'warning', text: 'ARCADE — already found' })
    expect(answerMessage({ answerType: 'not_a_word', word: 'arqqq' }))
      .toEqual({ outcome: 'warning', text: 'ARQQQ — not a word' })

    expect(answerMessage({ answerType: 'too_short', word: 'arc' }))
      .toEqual({ outcome: 'lost', text: 'ARC — too short' })
    expect(answerMessage({ answerType: 'missing_base', word: 'cards', base: 'arc' }))
      .toEqual({ outcome: 'lost', text: 'CARDS — must contain "ARC"' })
  })
})

describe('answerOf', () => {
  it('splits a miss by whether the base is in it', () => {
    expect(answerOf({ answer: 'not_legal', word: 'cots' }, 'ar'))
      .toEqual({ answerType: 'missing_base', word: 'cots', base: 'ar' })
    expect(answerOf({ answer: 'not_legal', word: 'arqqq' }, 'ar').answerType).toBe('not_a_word')
    // Before the game loads there is no base to be missing.
    expect(answerOf({ answer: 'not_legal', word: 'cots' }, '').answerType).toBe('not_a_word')
  })

  it('passes the other three through', () => {
    const entry = { word: 'arcade', points: 6, isBonus: false }
    expect(answerOf({ answer: 'accepted', word: 'arcade', entry }, 'arc')).toEqual({ answerType: 'accepted' })
    expect(answerOf({ answer: 'already_found', word: 'arcade', entry }, 'arc'))
      .toEqual({ answerType: 'already_found', word: 'arcade' })
    expect(answerOf({ answer: 'too_short', word: 'arc' }, 'arc')).toEqual({ answerType: 'too_short', word: 'arc' })
  })
})

describe('eventToOutcome', () => {
  it('colors a logged row as its live answer did', () => {
    const row = { word: 'arcade', length: 6 }
    expect(eventToOutcome({ ...row, valid: true, reason: null })).toBe('won')
    expect(eventToOutcome({ ...row, valid: false, reason: 'not_a_word' })).toBe('warning')
    expect(eventToOutcome({ ...row, valid: false, reason: 'too_short' })).toBe('lost')
    expect(eventToOutcome({ ...row, valid: false, reason: 'missing_base' })).toBe('lost')
    // A rejected row with no reason is the dictionary's refusal.
    expect(eventToOutcome({ ...row, valid: false, reason: null })).toBe('warning')
  })
})

describe('peerAnswerMessage', () => {
  it('reads a teammate\'s row as the accepted_peer answer', () => {
    expect(peerAnswerMessage({ word: 'arcade', length: 6, valid: true, reason: null }))
      .toEqual({ outcome: 'won', text: 'ARCADE (6)' })
  })
})
