// cs-unmet

/**
 * wordle's Start gate — the rule that every possible answer must itself be a
 * guessable word, and which select it asks you to move.
 *
 * This is the case that exposed the whole `validate`-returns-an-object change.
 * The check existed, the message was right, and the field it named was rendered
 * directly above ready to show it — but `validate` returned a bare sentence, so
 * the message went to the dialog's bottom line instead, and nothing was red.
 * Asserting the KEY here is what makes that visible: the words alone were
 * correct the entire time.
 *
 * Reaching it takes moving the OTHER field, which is worth knowing. The
 * legal-guess select disables every band below the floor, so you cannot pick an
 * invalid value there — you raise Answer source and the floor moves out from
 * under a value that was fine a moment ago.
 */
import { describe, expect, it } from 'vitest'
import { answerMaxBand, DEFAULT_WORDLE_SETUP, legalGuessError } from './setup'

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

describe('legalGuessError', () => {
  it('accepts the defaults', () => {
    expect(legalGuessError(DEFAULT_WORDLE_SETUP)).toEqual({})
  })

  it('accepts a legal band at or above the answer band', () => {
    expect(legalGuessError(setup({ answer_source: 4, legal_guess: 4 }))).toEqual({})
    expect(legalGuessError(setup({ answer_source: 4, legal_guess: 6 }))).toEqual({})
  })

  it('refuses a legal band below the answer band, UNDER Legal guesses', () => {
    // The exact setup that reaches it from the dialog: leave Legal guesses at
    // its default of 4 and raise Answer source to 5.
    expect(legalGuessError(setup({ answer_source: 5, legal_guess: 4 }))).toEqual({
      legal_guess: expect.stringMatching(/at least band 5/),
    })
  })

  it('names the band you have to reach, not the one you set', () => {
    expect(legalGuessError(setup({ answer_source: 6, legal_guess: 2 }))).toEqual({
      legal_guess: expect.stringMatching(/at least band 6/),
    })
  })

  it('holds for the Wordle list too, whose floor is 2 rather than 0', () => {
    expect(legalGuessError(setup({ answer_source: 0, legal_guess: 1 }))).toEqual({
      legal_guess: expect.stringMatching(/at least band 2/),
    })
    expect(legalGuessError(setup({ answer_source: 0, legal_guess: 2 }))).toEqual({})
  })
})
