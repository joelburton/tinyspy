// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * wordle's one outcome decision.
 *
 * A `wordle.guesses` row's `is_correct` picks the key, so there is no
 * facts-to-answer step to test — what this pins is the table, against the SQL
 * half in `supabase/tests/wordle/gameplay_test.sql`, which asserts
 * `submit_guess` answers `won` for a solving guess and `neutral` for one that
 * colors but does not solve. One rule in two languages, so a word changed in
 * either fails the other's test.
 *
 * The two soft rejects are not here on purpose. A duplicate and a word off the
 * list write no row, so the pill and the board's reject ring are their only
 * surfaces and both read the envelope's `outcome` straight through.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer the word its RPC envelope carries', () => {
    expect(ANSWER_OUTCOME).toEqual({
      correct: 'won',
      incorrect: 'neutral',
    })
  })
})
