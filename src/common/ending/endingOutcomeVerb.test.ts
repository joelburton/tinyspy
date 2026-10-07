// cs-blessed-ending

import { describe, expect, it } from 'vitest'
import { endingOutcomeVerb } from './endingOutcomeVerb'

/**
 * The whole truth table for the compete strip's ending word, including the
 * place a player ranked below first reads as.
 */

type Standing = Parameters<typeof endingOutcomeVerb>[0]

/** A player, defaulted to the ordinary "played and did not win" case. */
const player = (over: Partial<Standing> = {}): Standing => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  ...over,
})

describe('endingOutcomeVerb', () => {
  it('says Won when the player came out won', () => {
    expect(endingOutcomeVerb(player({ finalRanking: 1, outcome: 'won' }))).toBe('Won')
  })

  it('says Conceded for a conceder', () => {
    expect(endingOutcomeVerb(player({ conceded: true }))).toBe('Conceded')
  })

  it('says the place for a player ranked below first', () => {
    expect(endingOutcomeVerb(player({ finalRanking: 2, outcome: 'near' }))).toBe('2nd')
    expect(endingOutcomeVerb(player({ finalRanking: 3, outcome: 'near' }))).toBe('3rd')
    expect(endingOutcomeVerb(player({ finalRanking: 4, outcome: 'near' }))).toBe('4th')
  })

  it('reads the teens and the twenties right', () => {
    expect(endingOutcomeVerb(player({ finalRanking: 11, outcome: 'near' }))).toBe('11th')
    expect(endingOutcomeVerb(player({ finalRanking: 12, outcome: 'near' }))).toBe('12th')
    expect(endingOutcomeVerb(player({ finalRanking: 13, outcome: 'near' }))).toBe('13th')
    expect(endingOutcomeVerb(player({ finalRanking: 21, outcome: 'near' }))).toBe('21st')
    expect(endingOutcomeVerb(player({ finalRanking: 22, outcome: 'near' }))).toBe('22nd')
  })

  it('says Lost for anyone else who did not win', () => {
    expect(endingOutcomeVerb(player())).toBe('Lost')
    expect(endingOutcomeVerb(player({ outcome: null }))).toBe('Lost')
  })
})
