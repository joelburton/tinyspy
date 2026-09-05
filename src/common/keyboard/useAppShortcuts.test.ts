// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNonGameField, useAppShortcuts } from './useAppShortcuts'
import { getChatOpen, setChatOpen } from '../chat/chatOpenStore'
import { registerPageMenu } from '../menu/pageMenuStore'

/** Releases whatever page menu the current test registered — see afterEach. */
let releaseMenu: (() => void) | undefined

function press(key: string, target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('isNonGameField', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

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

describe('useAppShortcuts', () => {
  beforeEach(() => {
    setChatOpen(false)
  })
  afterEach(() => {
    document.body.innerHTML = ''
    setChatOpen(false)
    // The page-menu slot is module-level, so a registration left behind would
    // answer the NEXT test's `?`.
    releaseMenu?.()
    releaseMenu = undefined
  })

  it('"/" opens chat and "?" opens the menu when nothing/board is focused', () => {
    // `?` reaches the page's menu through the store a <PageHeaderMenu>
    // registers with, not through an argument — so the test registers one.
    const openMenu = vi.fn()
    releaseMenu = registerPageMenu(openMenu)
    renderHook(() => useAppShortcuts())

    press('/', document.body)
    expect(getChatOpen()).toBe(true)

    press('?', document.body)
    expect(openMenu).toHaveBeenCalledTimes(1)
  })

  it('"?" with no menu registered does nothing', () => {
    // GamePage drops its menu while the game is paused, so this is the live
    // case, not a hypothetical: the shortcut has to be a no-op rather than a
    // crash.
    renderHook(() => useAppShortcuts())
    expect(() => press('?', document.body)).not.toThrow()
  })

  it('"~" returns the word-lookup dialog node (idle → open)', () => {
    const { result } = renderHook(() => useAppShortcuts())

    // Idle: nothing rendered.
    expect(result.current).toBeNull()

    // Pressing "~" flips the hook's own open state, so the hook now
    // returns the dialog node for the caller to render.
    act(() => press('~', document.body))
    expect(result.current).not.toBeNull()
  })

  it('fires while a GAME input is focused (data-game-input)', () => {
    const openMenu = vi.fn()
    releaseMenu = registerPageMenu(openMenu)
    renderHook(() => useAppShortcuts())

    const gameInput = document.createElement('input')
    gameInput.setAttribute('data-game-input', '')
    document.body.append(gameInput)

    press('/', gameInput)
    expect(getChatOpen()).toBe(true)
  })

  it('⌥` toggles the anagram dialog — matched by CODE, surviving the mac dead key', () => {
    const { result } = renderHook(() => useAppShortcuts())
    expect(result.current).toBeNull()

    // On macOS ⌥` is the accent composer, so e.key arrives as 'Dead' — the
    // physical e.code is what the binding matches.
    const chord = () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Dead', code: 'Backquote', altKey: true, bubbles: true }),
      )
    act(() => { chord() })
    expect(result.current).not.toBeNull()
    // The same chord toggles it closed.
    act(() => { chord() })
    expect(result.current).toBeNull()
  })

  it('a bare backquote (no alt) is not the anagram chord', () => {
    const { result } = renderHook(() => useAppShortcuts())
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: '`', code: 'Backquote', bubbles: true }),
      )
    })
    expect(result.current).toBeNull()
  })

  it('does NOT fire while a non-game field is focused (setup input, chat box)', () => {
    const openMenu = vi.fn()
    releaseMenu = registerPageMenu(openMenu)
    const { result } = renderHook(() => useAppShortcuts())

    const input = document.createElement('input')
    document.body.append(input)

    press('/', input)
    press('?', input)
    press('~', input)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Dead', code: 'Backquote', altKey: true, bubbles: true }),
    )
    expect(getChatOpen()).toBe(false)
    expect(openMenu).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })
})
