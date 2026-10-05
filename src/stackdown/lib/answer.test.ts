// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome, peerAnswerOf } from './answer'

/**
 * stackdown's answers: every one's outcome and words.
 *
 * The envelope half is pinned in pgTAP (`supabase/tests/stackdown/` —
 * `gameplay_test.sql` for a played word, `reveal_test.sql` for the two
 * requests), which asserts that the envelopes carry NO outcome and no
 * sentence: how an answer reads is decided here alone.
 */
describe('answerMessage', () => {
  it('my accepted word says nothing; a teammate\'s names the word', () => {
    expect(answerMessage({ answerType: 'accepted' })).toEqual({ outcome: 'won', text: '' })
    expect(answerMessage({ answerType: 'accepted_peer', word: 'eagle' }))
      .toEqual({ outcome: 'won', text: 'found EAGLE' })
  })

  it('a refused word is a loss, mine named in full and a teammate\'s tersely', () => {
    expect(answerMessage({ answerType: 'invalid', word: 'ebatl' }))
      .toEqual({ outcome: 'lost', text: 'Not a word: EBATL' })
    expect(answerMessage({ answerType: 'invalid_peer', word: 'ebatl' }))
      .toEqual({ outcome: 'lost', text: 'tried EBATL' })
  })

  it('a hint is amber and a spoiler red; a teammate\'s names the act, never the content', () => {
    expect(answerMessage({ answerType: 'hint', clue: 'a bird of prey' }))
      .toEqual({ outcome: 'warning', text: 'Hint: a bird of prey' })
    expect(answerMessage({ answerType: 'hint_peer' }))
      .toEqual({ outcome: 'warning', text: 'revealed a hint' })
    expect(answerMessage({ answerType: 'spoiler', word: 'eagle' }))
      .toEqual({ outcome: 'lost', text: 'Next word: EAGLE' })
    expect(answerMessage({ answerType: 'spoiler_peer' }))
      .toEqual({ outcome: 'lost', text: 'took a spoiler' })
  })
})

describe('peerAnswerOf', () => {
  it('reads kind before valid, so a request is not a refused word', () => {
    // The trap: a request row leaves `valid` null, which is falsy — asking
    // about the verdict first would read both of these as a word that lost.
    expect(peerAnswerOf({ kind: 'hint', valid: null, word: null })).toEqual({ answerType: 'hint_peer' })
    expect(peerAnswerOf({ kind: 'spoiler', valid: null, word: 'eagle' })).toEqual({ answerType: 'spoiler_peer' })
  })

  it('splits a played word on its verdict', () => {
    expect(peerAnswerOf({ kind: 'word', valid: true, word: 'eagle' }))
      .toEqual({ answerType: 'accepted_peer', word: 'eagle' })
    expect(peerAnswerOf({ kind: 'word', valid: false, word: 'ebatl' }))
      .toEqual({ answerType: 'invalid_peer', word: 'ebatl' })
  })
})

describe('eventToOutcome', () => {
  it('colors a log row as its answer reads', () => {
    expect(eventToOutcome({ kind: 'word', valid: true, word: 'eagle' })).toBe('won')
    expect(eventToOutcome({ kind: 'word', valid: false, word: 'ebatl' })).toBe('lost')
    expect(eventToOutcome({ kind: 'hint', valid: null, word: null })).toBe('warning')
    expect(eventToOutcome({ kind: 'spoiler', valid: null, word: 'eagle' })).toBe('lost')
  })
})
