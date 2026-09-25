// cs-blessed-wordle

/**
 * wordle's Start gate — the rule that every possible answer must itself be a
 * guessable word, and which select it asks you to move.
 *
 * The KEY is asserted, not the words alone: `validate` returns an object so
 * the message lands under the field it names, and a bare sentence would go to
 * the dialog's bottom line with nothing red above it.
 *
 * Reaching it takes moving the OTHER field, which is worth knowing. The
 * legal-guess select disables every band below the floor, so you cannot pick an
 * invalid value there — you raise Answer source and the floor moves out from
 * under a value that was fine a moment ago.
 */
import { describe, expect, it } from 'vitest'
import { answerMaxBand, DEFAULT_WORDLE_SETUP, legalError } from './setup'

const setup = (over: Partial<typeof DEFAULT_WORDLE_SETUP> = {}) => ({
  ...DEFAULT_WORDLE_SETUP,
  ...over,
})

describe('answerMaxBand', () => {
  it("reads the Wordle list as band 2, since it has no band of its own", () => {
    expect(answerMaxBand(setup({ answer_source: 0 }))).toBe(2)
  })

  it('is the answer band itself for every dictionary source', () => {
    for (const answer_source of [1, 2, 3, 4, 5, 6]) {
      expect(answerMaxBand(setup({ answer_source }))).toBe(answer_source)
    }
  })
})

describe('legalError', () => {
  it('accepts the defaults', () => {
    expect(legalError(DEFAULT_WORDLE_SETUP)).toEqual({})
  })

  it('accepts a legal band at or above the answer band', () => {
    expect(legalError(setup({ answer_source: 4, legal_band: 4 }))).toEqual({})
    expect(legalError(setup({ answer_source: 4, legal_band: 6 }))).toEqual({})
  })

  it('refuses a legal band below the answer band, UNDER Legal guesses', () => {
    // The exact setup that reaches it from the dialog: leave Legal guesses at
    // its default of 4 and raise Answer source to 5.
    expect(legalError(setup({ answer_source: 5, legal_band: 4 }))).toEqual({
      legal_band: expect.stringMatching(/at least band 5/),
    })
  })

  it('names the band you have to reach, not the one you set', () => {
    expect(legalError(setup({ answer_source: 6, legal_band: 2 }))).toEqual({
      legal_band: expect.stringMatching(/at least band 6/),
    })
  })

  it('holds for the Wordle list too, whose floor is 2 rather than 0', () => {
    expect(legalError(setup({ answer_source: 0, legal_band: 1 }))).toEqual({
      legal_band: expect.stringMatching(/at least band 2/),
    })
    expect(legalError(setup({ answer_source: 0, legal_band: 2 }))).toEqual({})
  })
})
