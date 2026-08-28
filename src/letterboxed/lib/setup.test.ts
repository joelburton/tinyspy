// cs-unmet

/**
 * letterboxed's Start gate — three settings, three different controls.
 *
 * The field is asserted with the message every time, because that is the half
 * that used to be missing: `letterboxedSetupError` covers Spare words, the
 * dictionary band and the typed board, and while it returned a bare sentence
 * all three landed on the dialog's bottom line together.
 *
 * The custom-board rules themselves are `parseSides`' and are tested where they
 * live (`customBoard.test.ts`); what is checked here is that its reason arrives
 * under the box the letters were typed into, rather than being reworded on the
 * way.
 */
import { describe, expect, it } from 'vitest'
import {
  customSidesError,
  DEFAULT_LETTERBOXED_SETUP_COOP,
  letterboxedSetupError,
} from './setup'

const setup = (over: Partial<typeof DEFAULT_LETTERBOXED_SETUP_COOP> = {}) => ({
  ...DEFAULT_LETTERBOXED_SETUP_COOP,
  ...over,
})

/** A legal board: twelve distinct letters, four sides of three. */
const GOOD_SIDES = 'abc-def-ghi-jkl'

describe('letterboxedSetupError', () => {
  it('accepts the defaults', () => {
    expect(letterboxedSetupError(DEFAULT_LETTERBOXED_SETUP_COOP)).toEqual({})
  })

  it('refuses spare words outside 0..5, under Spare words', () => {
    for (const extra_words of [-1, 6]) {
      expect(letterboxedSetupError(setup({ extra_words }))).toEqual({
        extra_words: expect.stringMatching(/between 0 and 5/),
      })
    }
  })

  it('accepts both ends of the spare-word range', () => {
    expect(letterboxedSetupError(setup({ extra_words: 0 }))).toEqual({})
    expect(letterboxedSetupError(setup({ extra_words: 5 }))).toEqual({})
  })

  it('refuses a band outside 1..6, under Dictionary', () => {
    for (const legal_band of [0, 7]) {
      expect(letterboxedSetupError(setup({ legal_band }))).toEqual({
        legal_band: expect.stringMatching(/between 1 and 6/),
      })
    }
  })
})

describe('customSidesError', () => {
  it('accepts blank — that is the random-board default, not an error', () => {
    expect(customSidesError(setup())).toEqual({})
    expect(customSidesError(setup({ custom_sides: '' }))).toEqual({})
  })

  it('accepts twelve distinct letters however they are punctuated', () => {
    for (const custom_sides of [GOOD_SIDES, 'ABC DEF GHI JKL', 'abcdefghijkl']) {
      expect(customSidesError(setup({ custom_sides })), custom_sides).toEqual({})
    }
  })

  it('relays the parser\'s own reason, under the box it was typed into', () => {
    // The count, said the way `parseSides` says it — a message reworded on the
    // way here would drift from the one the board field's own help promises.
    expect(customSidesError(setup({ custom_sides: 'abcdefghijk' }))).toEqual({
      custom_sides: expect.stringMatching(/that's 11/),
    })
    expect(customSidesError(setup({ custom_sides: 'abc-def-ghi-jka' }))).toEqual({
      custom_sides: expect.stringMatching(/never repeats/),
    })
  })

  it('is part of the Start gate', () => {
    expect(letterboxedSetupError(setup({ custom_sides: 'abcdefghijk' }))).toEqual({
      custom_sides: expect.any(String),
    })
  })
})
