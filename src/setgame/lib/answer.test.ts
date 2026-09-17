// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * setgame's one outcome decision.
 *
 * A `setgame.events` row's `kind` is already a key here, so there is no
 * facts-to-answer step to test — what this pins is the table itself, against
 * the SQL half in `supabase/tests/setgame/gameplay_test.sql`, which asserts
 * `submit_set` answers `won` for the same claim. They are one rule in two
 * languages, so a word changed in either fails the other's test.
 *
 * `hint` and `not_a_set` have no SQL half: `record_hint` deliberately carries
 * no outcome (asking for a hint shows itself, in the ring the client already
 * drew), and a non-set is refused on the frontend without an RPC at all.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its ruled word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      claim: 'won',
      hint: 'warning',
      not_a_set: 'lost',
    })
  })
})
