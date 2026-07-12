import { describe, expect, it } from 'vitest'
import {
  customLettersError,
  legalError,
  wordwheelSetupError,
  DEFAULT_WORDWHEEL_SETUP_COOP,
  type WordwheelSetup,
} from './setup'

/** A valid coop base to layer custom-letter fields onto. */
const base: WordwheelSetup = DEFAULT_WORDWHEEL_SETUP_COOP

describe('customLettersError', () => {
  it('is null when both custom fields are blank (→ random board)', () => {
    expect(customLettersError(base)).toBeNull()
    expect(customLettersError({ ...base, custom_center: '', custom_letters: '' })).toBeNull()
  })

  it('accepts a valid center + eight distinct other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfghi' })).toBeNull()
  })

  it('normalizes case + surrounding space', () => {
    expect(
      customLettersError({ ...base, custom_center: ' E ', custom_letters: ' ABCDFGHI ' }),
    ).toBeNull()
  })

  it('requires BOTH fields when either is filled', () => {
    expect(customLettersError({ ...base, custom_center: 'e' })).toMatch(/both|eight other/i)
    expect(customLettersError({ ...base, custom_letters: 'abcdfghi' })).toMatch(/both|center/i)
  })

  it('rejects a multi-character center', () => {
    expect(customLettersError({ ...base, custom_center: 'ab', custom_letters: 'cdfghijk' })).toMatch(
      /center must be a single letter/i,
    )
  })

  it('rejects the wrong count of other letters', () => {
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcd' })).toMatch(
      /eight other letters/i,
    )
  })

  it("allows the letter 's' in either field (word wheel spends a tile per use)", () => {
    // Unlike spellingbee, 's' is an ordinary letter here.
    expect(customLettersError({ ...base, custom_center: 's', custom_letters: 'abcdfghi' })).toBeNull()
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'abcdfghs' })).toBeNull()
  })

  it('accepts repeated letters (the wheel is a multiset)', () => {
    // center 'a' also appears in the outer letters → a wheel with two a-tiles,
    // one of them the center.
    expect(customLettersError({ ...base, custom_center: 'a', custom_letters: 'abcdfghi' })).toBeNull()
    // 'a' repeated in the outer letters → two outer a-tiles.
    expect(customLettersError({ ...base, custom_center: 'e', custom_letters: 'aabcdfgh' })).toBeNull()
  })
})

describe('wordwheelSetupError — combines legal-band + custom-letters', () => {
  it('surfaces the legal-band error first', () => {
    const bad: WordwheelSetup = { ...base, required: 5, legal: 3 }
    expect(wordwheelSetupError(bad)).toBe(legalError(bad))
    expect(wordwheelSetupError(bad)).toMatch(/legal words/i)
  })

  it('surfaces a custom-letters error when the bands are fine', () => {
    expect(wordwheelSetupError({ ...base, custom_center: 'e', custom_letters: 'abc' })).toMatch(
      /eight other letters/i,
    )
  })

  it('is null for a valid setup (no custom letters)', () => {
    expect(wordwheelSetupError(base)).toBeNull()
  })

  it('is null for a valid setup WITH custom letters', () => {
    expect(
      wordwheelSetupError({ ...base, custom_center: 'e', custom_letters: 'abcdfghi' }),
    ).toBeNull()
  })
})
