import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isNonGameField, useChatMenuShortcuts } from './useChatMenuShortcuts'
import { getChatOpen, setChatOpen } from '../lib/chatOpenStore'

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

describe('useChatMenuShortcuts', () => {
  beforeEach(() => {
    setChatOpen(false)
  })
  afterEach(() => {
    document.body.innerHTML = ''
    setChatOpen(false)
  })

  it('"/" opens chat and "?" opens the menu when nothing/board is focused', () => {
    const openMenu = vi.fn()
    renderHook(() => useChatMenuShortcuts(openMenu))

    press('/', document.body)
    expect(getChatOpen()).toBe(true)

    press('?', document.body)
    expect(openMenu).toHaveBeenCalledTimes(1)
  })

  it('fires while a GAME input is focused (data-game-input)', () => {
    const openMenu = vi.fn()
    renderHook(() => useChatMenuShortcuts(openMenu))

    const gameInput = document.createElement('input')
    gameInput.setAttribute('data-game-input', '')
    document.body.append(gameInput)

    press('/', gameInput)
    expect(getChatOpen()).toBe(true)
  })

  it('does NOT fire while a non-game field is focused (setup input, chat box)', () => {
    const openMenu = vi.fn()
    renderHook(() => useChatMenuShortcuts(openMenu))

    const input = document.createElement('input')
    document.body.append(input)

    press('/', input)
    press('?', input)
    expect(getChatOpen()).toBe(false)
    expect(openMenu).not.toHaveBeenCalled()
  })
})
