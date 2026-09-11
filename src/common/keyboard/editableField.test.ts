// cs-blessed-keyboard

/**
 * Tests for the two predicates every key listener asks: is this a text field,
 * and is it one of the app's rather than the game's.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { isEditableField, isNonGameField } from './editableField'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isEditableField', () => {
  it('is false for the board and the page body', () => {
    expect(isEditableField(document.body)).toBe(false)
    expect(isEditableField(document.createElement('div'))).toBe(false)
    expect(isEditableField(null)).toBe(false)
  })

  it('is true for every field that owns its own keys', () => {
    // `<select>` is in the list on purpose: a focused native select swallows
    // arrows and Enter, so a game must not also act on them.
    for (const tag of ['input', 'textarea', 'select'] as const) {
      expect(isEditableField(document.createElement(tag))).toBe(true)
    }
  })

  // The contenteditable arm is unasserted: jsdom does not implement
  // `isContentEditable` at all, so a test here would only pin jsdom's gap.

  it('does not care about data-game-input — that is the other question', () => {
    const input = document.createElement('input')
    input.setAttribute('data-game-input', '')
    expect(isEditableField(input)).toBe(true)
  })
})

describe('isNonGameField', () => {
  it('is false for non-editable targets (the board / page body)', () => {
    expect(isNonGameField(document.body)).toBe(false)
    expect(isNonGameField(document.createElement('div'))).toBe(false)
    expect(isNonGameField(null)).toBe(false)
  })

  it('is true for a plain input / textarea / select (setup forms, chat)', () => {
    for (const tag of ['input', 'textarea', 'select'] as const) {
      expect(isNonGameField(document.createElement(tag))).toBe(true)
    }
  })

  it('is false for an input opted in with data-game-input', () => {
    const input = document.createElement('input')
    input.setAttribute('data-game-input', '')
    expect(isNonGameField(input)).toBe(false)
  })
})
