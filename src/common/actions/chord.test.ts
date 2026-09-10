// cs-unmet

import { describe, expect, it } from 'vitest'
import { isPattern, matches, type KeySpec } from './chord'

/**
 * The key matcher, branch by branch — including the macOS dead-key cases that
 * are the whole reason a chord can match on the physical key.
 */

/** A keydown, with everything the matcher reads and nothing else. */
function press(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    code: '',
    ...init,
  } as KeyboardEvent
}

const PLUS: KeySpec = { key: '+', shiftAgnostic: true, label: '+' }
const ALT_Z: KeySpec = { code: 'KeyZ', alt: true, shiftAgnostic: true, label: '⌥Z' }
const SHIFT_BACKSPACE: KeySpec = { key: 'Backspace', shift: true, label: '⇧⌫' }
const BACKSPACE: KeySpec = { key: 'Backspace', label: '⌫' }

describe('matches — a chord', () => {
  it('matches the character it names', () => {
    expect(matches(PLUS, press({ key: '+' }))).toBe(true)
    expect(matches(PLUS, press({ key: '=' }))).toBe(false)
  })

  it('ignores shift when the chord is shift-agnostic', () => {
    // `+` is Shift-Equal on a US layout and unshifted elsewhere, so the shift
    // state says nothing about whether the player pressed the key they meant.
    expect(matches(PLUS, press({ key: '+', shiftKey: true }))).toBe(true)
    expect(matches(PLUS, press({ key: '+', shiftKey: false }))).toBe(true)
  })

  it('requires shift exactly when the chord says so', () => {
    expect(matches(SHIFT_BACKSPACE, press({ key: 'Backspace', shiftKey: true }))).toBe(true)
    expect(matches(SHIFT_BACKSPACE, press({ key: 'Backspace' }))).toBe(false)
    // And the unshifted twin is a different command, not a looser one.
    expect(matches(BACKSPACE, press({ key: 'Backspace', shiftKey: true }))).toBe(false)
    expect(matches(BACKSPACE, press({ key: 'Backspace' }))).toBe(true)
  })

  it('needs the modifier the chord asks for, and no other', () => {
    expect(matches(ALT_Z, press({ key: 'Ω', code: 'KeyZ', altKey: true }))).toBe(true)
    expect(matches(ALT_Z, press({ key: 'z', code: 'KeyZ' }))).toBe(false)
    expect(matches(BACKSPACE, press({ key: 'Backspace', altKey: true }))).toBe(false)
    expect(matches(BACKSPACE, press({ key: 'Backspace', ctrlKey: true }))).toBe(false)
  })

  it('matches the PHYSICAL key when the chord names a code', () => {
    // Option changes the character: ⌥Z is Ω and ⌥= is ≠, so `e.key` is useless
    // here and `e.code` is the only stable half of the event.
    const altEqual: KeySpec = { code: 'Equal', alt: true, shiftAgnostic: true, label: '⌥+' }
    expect(matches(altEqual, press({ key: '≠', code: 'Equal', altKey: true }))).toBe(true)
    expect(matches(altEqual, press({ key: '±', code: 'Equal', altKey: true, shiftKey: true }))).toBe(true)
  })

  it('matches the anagram chord, whose key arrives as Dead on macOS', () => {
    const anagram: KeySpec = { code: 'Backquote', alt: true, shiftAgnostic: true, label: '⌥~' }
    expect(matches(anagram, press({ key: 'Dead', code: 'Backquote', altKey: true }))).toBe(true)
  })

  it('never matches while Cmd is held', () => {
    // Cmd is the browser's — reload, new tab, the address bar.
    expect(matches(PLUS, press({ key: '+', metaKey: true }))).toBe(false)
    expect(matches(ALT_Z, press({ key: 'Ω', code: 'KeyZ', altKey: true, metaKey: true }))).toBe(false)
  })
})

describe('matches — a pattern', () => {
  const letter: KeySpec = { pattern: 'letter', label: 'A–Z' }
  const digit: KeySpec = { pattern: 'digit', label: '0–9' }
  const arrow: KeySpec = { pattern: 'arrow', label: '↑ ↓ ← →' }
  const any: KeySpec = { pattern: 'any', label: 'any key' }

  it('matches its own class and nothing else', () => {
    expect(matches(letter, press({ key: 'q' }))).toBe(true)
    expect(matches(letter, press({ key: 'Q', shiftKey: true }))).toBe(true)
    expect(matches(letter, press({ key: '4' }))).toBe(false)
    expect(matches(letter, press({ key: 'Enter' }))).toBe(false)
    expect(matches(digit, press({ key: '4' }))).toBe(true)
    expect(matches(digit, press({ key: 'q' }))).toBe(false)
    expect(matches(arrow, press({ key: 'ArrowLeft' }))).toBe(true)
    expect(matches(arrow, press({ key: 'a' }))).toBe(false)
  })

  it('takes any key at all, for the any-key behaviors', () => {
    expect(matches(any, press({ key: 'Escape' }))).toBe(true)
    expect(matches(any, press({ key: 'F5' }))).toBe(true)
  })

  it('is not a key someone is typing once a modifier is held', () => {
    expect(matches(letter, press({ key: 'r', ctrlKey: true }))).toBe(false)
    expect(matches(letter, press({ key: 'Ω', altKey: true }))).toBe(false)
    expect(matches(any, press({ key: 'r', metaKey: true }))).toBe(false)
  })
})

describe('isPattern', () => {
  it('tells the two arms apart', () => {
    expect(isPattern({ pattern: 'letter', label: 'A–Z' })).toBe(true)
    expect(isPattern(PLUS)).toBe(false)
  })
})
