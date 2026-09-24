// cs-unmet

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useGameHasKeyboard } from './useGameHasKeyboard'

/**
 * The game owns the keyboard exactly while no text field has focus — the rule
 * the entry's caret blinks by. What each case moves is focus, the one thing
 * the hook reads: into a field, back out to the page, and from one field to
 * another, where the `focusout` in between must not hand the keys back early.
 */
describe('useGameHasKeyboard', () => {
  const fields: HTMLElement[] = []
  /** An element of this tag in the page, removed after the test. */
  function add<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    document.body.appendChild(el)
    fields.push(el)
    return el
  }

  afterEach(() => {
    cleanup()
    for (const el of fields.splice(0)) el.remove()
  })

  it('is true when nothing is focused', () => {
    const { result } = renderHook(() => useGameHasKeyboard())
    expect(result.current).toBe(true)
  })

  it('is false while a text field has focus, and true again once it is left', () => {
    const input = add('input')
    const { result } = renderHook(() => useGameHasKeyboard())

    act(() => input.focus())
    expect(result.current).toBe(false)

    act(() => input.blur())
    expect(result.current).toBe(true)
  })

  it('stays false moving from one field straight to another', () => {
    const first = add('input')
    const second = add('textarea')
    const { result } = renderHook(() => useGameHasKeyboard())

    act(() => first.focus())
    act(() => second.focus())
    expect(result.current).toBe(false)
  })

  it('keeps the keys with the field when a focusout names another as the next owner', () => {
    // A real move fires focusin right after, which would settle it either way;
    // the focusout alone is what shows the hook reads `relatedTarget` rather
    // than treating every blur as focus returning to the page.
    const first = add('input')
    const second = add('input')
    const { result } = renderHook(() => useGameHasKeyboard())

    act(() => first.focus())
    act(() => {
      first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: second }))
    })
    expect(result.current).toBe(false)
  })

  it('gives the keys back when focus moves from a field to a button', () => {
    const input = add('input')
    const button = add('button')
    const { result } = renderHook(() => useGameHasKeyboard())

    act(() => input.focus())
    act(() => button.focus())
    expect(result.current).toBe(true)
  })

  it('starts false when it mounts with a field already focused', () => {
    const input = add('input')
    input.focus()
    const { result } = renderHook(() => useGameHasKeyboard())
    expect(result.current).toBe(false)
  })
})
