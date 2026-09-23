// cs-met-spellingbee

import { describe, it, expect } from 'vitest'
import { ANSWER_OUTCOME } from './answer'

/**
 * spellingbee's one outcome decision.
 *
 * There is no SQL half to pin: this is a trusting-commit game, so the FRONTEND
 * judges every word against the shipped list and `submit_word` records what it
 * is told. The shared engine routes all four answers — `accepted` included —
 * through `outcomeFor`, which indexes this table, so the pill and the hexes
 * cannot disagree.
 */
describe('ANSWER_OUTCOME', () => {
  it('gives each answer its word', () => {
    expect(ANSWER_OUTCOME).toEqual({
      accepted: 'won',
      already_found: 'warning',
      not_legal: 'lost',
      too_short: 'warning',
    })
  })
})
