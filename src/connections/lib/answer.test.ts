// cs-met-connections

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * connections' one outcome decision.
 *
 * A `connections.events.result` value is already a key here, so there is no
 * facts-to-answer step to test — what this pins is the table, against the SQL
 * half in `supabase/tests/connections/gameplay_test.sql`, which asserts
 * `submit_guess` names each case in the wire word and carries the matching
 * outcome. One rule in two languages, so a word changed in either fails the
 * other's test.
 *
 * Unusually, the FRONTEND decides which answer a guess is — the board is
 * publicly readable, so `evaluateGuess` adjudicates locally and sends the
 * verdict up. The server still says what it is worth, because a call site may
 * not read its own local value back to pick an `ok` branch.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each wire word its outcome', () => {
    expect(ANSWER_OUTCOME).toEqual({
      correct: 'won',
      oneAway: 'near',
      wrong: 'lost',
    })
  })
})
