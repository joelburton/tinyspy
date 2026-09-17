// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * strands' one outcome decision.
 *
 * An `events` row's `result` is already a key here (a hint row has none, which
 * is what `spent_hint` is), so there is no facts-to-answer step to test — what
 * this pins is the table, against the SQL half in
 * `supabase/tests/strands/gameplay_test.sql`, which asserts `submit_path`
 * answers `near` for a valid non-theme word. One rule in two languages, so a
 * word changed in either fails the other's test.
 *
 * `spend_hint`'s `warning` is asserted in `hint_test.sql`; the two `warning`s
 * for a duplicate and a short word ride `submit_path`'s envelope, which
 * `gameplay_test.sql` pins beside the words above.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its ruled word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      spangram: 'won',
      theme: 'won',
      hint_word: 'near',
      duplicate: 'warning',
      too_short: 'warning',
      invalid: 'lost',
      spent_hint: 'warning',
    })
  })
})
