// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * wordiply's one outcome decision — the doc's worked example
 * (docs/outcomes.md → How a game does it).
 *
 * There is no SQL half to pin: `submit_guess` records what the frontend tells
 * it and its envelope carries no outcome. Five answers rather than the shared
 * engine's four, because a rejected guess is a TURN here and its row's `reason`
 * distinguishes the two rule breaks (`too_short`, `missing_base`) from the two
 * misses.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      accepted: 'won',
      already_found: 'warning',
      not_a_word: 'warning',
      too_short: 'lost',
      missing_base: 'lost',
    })
  })
})
