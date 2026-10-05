// cs-unmet

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome } from './answer'

/**
 * waffle's answers: every one's outcome and words. `submit_swap`'s envelope
 * carries no outcome (supabase/tests/waffle/gameplay_test.sql pins it), so how
 * an answer reads is decided here alone.
 */
describe('answerMessage', () => {
  it('a swap counts and nothing judges it, so it says nothing', () => {
    expect(answerMessage({ answerType: 'swapped_peer' })).toEqual({ outcome: 'neutral', text: '' })
    expect(eventToOutcome()).toBe('neutral')
  })

  it('a rival solving is won, a rival out of swaps a warning', () => {
    expect(answerMessage({ answerType: 'solved_peer' })).toEqual({ outcome: 'won', text: 'solved it' })
    expect(answerMessage({ answerType: 'out_of_swaps_peer' }))
      .toEqual({ outcome: 'warning', text: 'out of swaps' })
  })
})
