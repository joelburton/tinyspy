// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * scrabble's one outcome decision.
 *
 * A `scrabble.events` row's `kind` is already a key here, so there is no
 * facts-to-answer step to test — what this pins is the table, against the SQL
 * half: `play_word_test.sql` asserts a played word answers `won`,
 * `exchange_pass_test.sql` that an exchange answers `neutral`. One rule in two
 * languages, so a word changed in either fails the other's test.
 *
 * `leftovers` has no SQL half to pin. It is the row `end_game` writes when a coop
 * table stops with tiles in hand, and that RPC's envelope is about the GAME
 * ending rather than about the row — so this table is the only authority for it.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its ruled word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      word: 'won',
      exchange: 'neutral',
      pass: 'neutral',
      leftovers: 'neutral',
    })
  })
})
