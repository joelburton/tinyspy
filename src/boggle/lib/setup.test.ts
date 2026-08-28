// cs-unmet

/**
 * boggle's setup guards — what each refusal says, and WHICH control it is about.
 *
 * The field is asserted alongside the message, not instead of it. `legalError`
 * covers six different selects, and when it returned a bare sentence every one
 * of them landed on the dialog's bottom line: "Difficulty band must be 1–6" and
 * "Minimum word length must be 3–9" arrived in the same place, and reading which
 * select was meant was the player's job. A test that checked only the words was
 * green through all of that.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_BOGGLE_SETUP_COOP, legalError } from './setup'

const about = (field: string, pattern: RegExp) => ({ [field]: expect.stringMatching(pattern) })

describe('legalError', () => {
  it('accepts the defaults', () => {
    expect(legalError(DEFAULT_BOGGLE_SETUP_COOP)).toEqual({})
  })
  it('rejects an unknown dice set, under Dice set', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, dice_set: 'zzz' })).toEqual(
      about('dice_set', /dice set/i),
    )
  })
  it('rejects an out-of-range band, under Difficulty', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, band: 9 })).toEqual(
      about('band', /band/i),
    )
  })
  it('rejects a too-low min word length, under Minimum word length', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, min_word_length: 2 })).toEqual(
      about('min_word_length', /length/i),
    )
  })
  it('rejects an unknown scoring ladder, under Scoring', () => {
    expect(
      legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, scoring_ladder: 'nope' as never }),
    ).toEqual(about('scoring_ladder', /ladder/i))
  })
  it('accepts a null win target and a valid percent', () => {
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, win_percent: null })).toEqual({})
    expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, win_percent: 75 })).toEqual({})
  })
  it('rejects a win target below 50, above 100, or off the 5-step, under Win target', () => {
    for (const win_percent of [45, 105, 72]) {
      expect(legalError({ ...DEFAULT_BOGGLE_SETUP_COOP, win_percent })).toEqual(
        about('win_percent', /win target/i),
      )
    }
  })
})
