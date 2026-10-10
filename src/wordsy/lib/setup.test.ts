// cs-unmet

import { describe, expect, it } from 'vitest'
import { DEFAULT_WORDSY_SETUP, wordsySetupError } from './setup'

describe('wordsySetupError', () => {
  it('passes the defaults', () => {
    expect(wordsySetupError(DEFAULT_WORDSY_SETUP)).toEqual({})
  })

  it('refuses a band outside 1–6, under its field', () => {
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, legal_band: 7 })).toEqual({ legal_band: 'Pick a dictionary.' })
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, legal_band: 0 })).toEqual({ legal_band: 'Pick a dictionary.' })
  })

  it('refuses a round style it does not know, under its field', () => {
    expect(wordsySetupError({ ...DEFAULT_WORDSY_SETUP, round_style: 'fast' as never }))
      .toEqual({ round_style: 'Pick how a round ends.' })
  })
})
