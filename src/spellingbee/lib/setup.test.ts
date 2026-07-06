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

describe('customLettersError', () => {
  it('is null when both custom fields are blank (→ random board)', () => {
    expect(customLettersError(base)).toBeNull()
    expect(customLettersError({ ...base, custom_center: '', custom_letters: '' })).toBeNull()
  })

  it('accepts a valid center + six distinct other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfg' })).toBeNull()
  })

  it('normalizes case + surrounding space', () => {
    expect(customLettersError({ ...base, custom_center: ' E ', custom_letters: ' ABCDFG ' })).toBeNull()
  })

  it('requires BOTH fields when either is filled', () => {
    expect(customLettersError({ ...base, custom_center: 'e' })).toMatch(/both|six other/i)
    expect(customLettersError({ ...base, custom_letters: 'abcdfg' })).toMatch(/both|center/i)
  })

  it('rejects a multi-character center', () => {
    expect(customLettersError({ ...base, custom_center: 'ab', custom_letters: 'cdfghi' })).toMatch(
      /center must be a single letter/i,
    )
  })

  it('rejects the wrong count of other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcd' })).toMatch(
      /six other letters/i,
    )
  })

  it("rejects the letter 's' in either field", () => {
    expect(customLettersError({ ...base, custom_center: 's', custom_letters: 'abcdfg' })).toMatch(/S/)
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfs' })).toMatch(/S/)
  })

  it('rejects a repeated letter (center in the outer set, or a dup outer)', () => {
    // center 'a' also appears in the outer letters → only 6 distinct of 7.
    expect(customLettersError({ ...base, custom_center: 'a', custom_letters: 'abcdfg' })).toMatch(
      /different/i,
    )
    // 'a' repeated in the outer letters.
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'aabcdf' })).toMatch(
      /different/i,
    )
  })
})

describe('spellingbeeSetupError — combines legal-band + custom-letters', () => {
  it('surfaces the legal-band error first', () => {
    const bad: SpellingbeeSetup = { ...base, required: 5, legal: 3 }
    expect(spellingbeeSetupError(bad)).toBe(legalError(bad))
    expect(spellingbeeSetupError(bad)).toMatch(/legal words/i)
  })

  it('surfaces a custom-letters error when the bands are fine', () => {
    expect(spellingbeeSetupError({ ...base, custom_center: 's', custom_letters: 'abcdfg' })).toMatch(
      /S/,
    )
  })

  it('is null for a valid setup (no custom letters)', () => {
    expect(spellingbeeSetupError(base)).toBeNull()
  })

  it('is null for a valid setup WITH custom letters', () => {
    expect(
      spellingbeeSetupError({ ...base, custom_center: 'e', custom_letters: 'abcdfg' }),
    ).toBeNull()
  })
})
