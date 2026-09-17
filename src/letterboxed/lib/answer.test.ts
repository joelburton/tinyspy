// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * letterboxed's one outcome decision.
 *
 * A `letterboxed.events` row's `kind` is already a key here, so there is no
 * facts-to-answer step to test — what this pins is the table, against the SQL
 * half in `supabase/tests/letterboxed/gameplay_test.sql`, which asserts
 * `submit_word` answers `won` and that `undo_word` / `clear_chain` answer
 * `noted`. One rule in two languages, so a word changed in either fails the
 * other's test.
 *
 * `hint` and `spoiler` have no SQL half: `log_hint_or_spoiler` deliberately
 * carries no outcome, because the frontend computed the suggestion and pilled
 * it before the row was ever written. Their words are this table's alone.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its ruled word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      played: 'won',
      undone: 'noted',
      cleared: 'noted',
      hint: 'warning',
      spoiler: 'lost',
    })
  })
})
