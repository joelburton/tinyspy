// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME, answerOf } from './answer'

/**
 * The row half of psychicnum's one outcome decision.
 *
 * The envelope half is pinned in `supabase/tests/psychicnum/gameplay_test.sql`,
 * which asserts `submit_guess` answers `won` / `lost` and `request_spoiler` /
 * `request_hint` answer `lost` / `warning` — the same four words the table below
 * gives. One rule in two languages, so a word changed in either fails the
 * other's test.
 */
describe('answerOf', () => {
  it('reads kind before is_correct, so a hint is not a correct guess', () => {
    // The trap: a hint and a spoiler row are both written `is_correct = true`,
    // so asking about the verdict first would read either as a hit.
    expect(answerOf({ kind: 'hint', is_correct: true })).toBe('hint')
    expect(answerOf({ kind: 'spoiler', is_correct: true })).toBe('spoiler')
  })

  it('splits a guess on its verdict', () => {
    expect(answerOf({ kind: 'guess', is_correct: true })).toBe('hit')
    expect(answerOf({ kind: 'guess', is_correct: false })).toBe('miss')
  })
})

describe('ANSWER_OUTCOME', () => {
  it('gives each answer the word its RPC envelope carries', () => {
    expect(ANSWER_OUTCOME).toEqual({
      hit: 'won',
      miss: 'lost',
      hint: 'warning',
      spoiler: 'lost',
      not_on_board: 'lost',
    })
  })
})
