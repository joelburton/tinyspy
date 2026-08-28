// cs-unmet

import { describe, expect, it } from 'vitest'
import {
  customLettersError,
  legalError,
  spellingbeeSetupError,
  DEFAULT_SPELLINGBEE_SETUP_COOP,
  type SpellingbeeSetup,
} from './setup'

/** A valid coop base to layer custom-letter fields onto. */
const base: SpellingbeeSetup = DEFAULT_SPELLINGBEE_SETUP_COOP

/** Every `customLettersError` message is about the ONE box the letters are
 *  typed into (the form writes `custom_center` and `custom_letters` from a
 *  single field), and `legalError`'s is about the legal-band select. Asserting
 *  the key with the words is the point: a message under the wrong control
 *  looks perfectly correct on screen. */
const onLetters = (pattern: RegExp) => ({ custom_letters: expect.stringMatching(pattern) })
const onLegal = (pattern: RegExp) => ({ legal: expect.stringMatching(pattern) })

describe('customLettersError', () => {
  it('is null when both custom fields are blank (→ random board)', () => {
    expect(customLettersError(base)).toEqual({})
    expect(customLettersError({ ...base, custom_center: '', custom_letters: '' })).toEqual({})
  })

  it('accepts a valid center + six distinct other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfg' })).toEqual({})
  })

  it('normalizes case + surrounding space', () => {
    expect(customLettersError({ ...base, custom_center: ' E ', custom_letters: ' ABCDFG ' })).toEqual({})
  })

  it('requires BOTH fields when either is filled', () => {
    expect(customLettersError({ ...base, custom_center: 'e' })).toEqual(onLetters(/both|six other/i))
    expect(customLettersError({ ...base, custom_letters: 'abcdfg' })).toEqual(onLetters(/both|center/i))
  })

  it('rejects a multi-character center', () => {
    expect(customLettersError({ ...base, custom_center: 'ab', custom_letters: 'cdfghi' })).toEqual(onLetters(/center must be a single letter/i))
  })

  it('rejects the wrong count of other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcd' })).toEqual(onLetters(/six other letters/i))
  })

  it("rejects the letter 's' in either field", () => {
    expect(customLettersError({ ...base, custom_center: 's', custom_letters: 'abcdfg' })).toEqual(onLetters(/S/))
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfs' })).toEqual(onLetters(/S/))
  })

  it('rejects a repeated letter (center in the outer set, or a dup outer)', () => {
    // center 'a' also appears in the outer letters → only 6 distinct of 7.
    expect(customLettersError({ ...base, custom_center: 'a', custom_letters: 'abcdfg' })).toEqual(onLetters(/different/i))
    // 'a' repeated in the outer letters.
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'aabcdf' })).toEqual(onLetters(/different/i))
  })
})

describe('spellingbeeSetupError — combines legal-band + custom-letters', () => {
  it('surfaces the legal-band error first', () => {
    const bad: SpellingbeeSetup = { ...base, required: 5, legal: 3 }
    expect(spellingbeeSetupError(bad)).toEqual(legalError(bad))
    expect(spellingbeeSetupError(bad)).toEqual(onLegal(/legal words/i))
  })

  it('surfaces a custom-letters error when the bands are fine', () => {
    expect(spellingbeeSetupError({ ...base, custom_center: 's', custom_letters: 'abcdfg' })).toEqual(onLetters(/S/))
  })

  it('is null for a valid setup (no custom letters)', () => {
    expect(spellingbeeSetupError(base)).toEqual({})
  })

  it('is null for a valid setup WITH custom letters', () => {
    expect(
      spellingbeeSetupError({ ...base, custom_center: 'e', custom_letters: 'abcdfg' }),
    ).toEqual({})
  })
})
