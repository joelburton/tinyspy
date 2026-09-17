// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME, answerOf } from './answer'

/**
 * The row half of stackdown's one outcome decision.
 *
 * The envelope half is pinned in pgTAP (`supabase/tests/stackdown/` —
 * `gameplay_test.sql` for a played word, `reveal_test.sql` for the two
 * requests), which asserts the same four words the table below gives. They are
 * one rule written in two languages, so a word changed in either language
 * fails the other's test.
 */
describe('answerOf', () => {
  it('reads kind before valid, so a request is not a refused word', () => {
    // The trap: a request row leaves `valid` null, which is falsy — asking
    // about the verdict first would read both of these as a word that lost.
    expect(answerOf({ kind: 'hint', valid: null })).toBe('hint')
    expect(answerOf({ kind: 'reveal', valid: null })).toBe('reveal')
  })

  it('splits a played word on its verdict', () => {
    expect(answerOf({ kind: 'word', valid: true })).toBe('accepted')
    expect(answerOf({ kind: 'word', valid: false })).toBe('invalid')
  })
})

describe('ANSWER_OUTCOME', () => {
  it('gives each answer the word its RPC envelope carries', () => {
    expect(ANSWER_OUTCOME).toEqual({
      accepted: 'won',
      invalid: 'lost',
      hint: 'warning',
      reveal: 'lost',
    })
  })
})
