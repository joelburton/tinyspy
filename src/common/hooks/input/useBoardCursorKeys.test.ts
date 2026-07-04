/**
 * Tests for the shared 2-D board-cursor keyboard (bananagrams + scrabble): arrows
 * move the cursor, a letter places, Backspace/Enter dispatch, Space is an optional
 * commit shortcut, a focused button suppresses Enter/Space (no double-fire),
 * onAnyKey can consume the key, and it inherits useGlobalKeyHandler's guards.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBoardCursorKeys, type BoardCursorKeysOptions } from './useBoardCursorKeys'

function press(key: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function setup(over: Partial<BoardCursorKeysOptions> = {}) {
  const cb = {
    onArrow: vi.fn(),
    onLetter: vi.fn(),
    onBackspace: vi.fn(),
    onEnter: vi.fn(),
  }
  renderHook(() => useBoardCursorKeys({ enabled: true, ...cb, ...over }))
  return cb
}

describe('useBoardCursorKeys', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('maps arrows → onArrow, a letter → onLetter (uppercased), Backspace, Enter', () => {
    const cb = setup()
    press('ArrowLeft')
    press('a')
    press('Backspace')
    press('Enter')
    expect(cb.onArrow).toHaveBeenCalledWith('ArrowLeft')
    expect(cb.onLetter).toHaveBeenCalledWith('A')
    expect(cb.onBackspace).toHaveBeenCalledTimes(1)
    expect(cb.onEnter).toHaveBeenCalledTimes(1)
  })

  it('Space commits only when enterOnSpace (bananagrams peel)', () => {
    const off = setup()
    press(' ')
    expect(off.onEnter).not.toHaveBeenCalled()

    const on = setup({ enterOnSpace: true })
    press(' ')
    expect(on.onEnter).toHaveBeenCalledTimes(1)
  })

  it('does not fire Enter when a <button> is focused (no double-fire)', () => {
    const cb = setup()
    const button = document.createElement('button')
    document.body.append(button)
    press('Enter', button)
    expect(cb.onEnter).not.toHaveBeenCalled()
  })

  it('bails on modifier chords', () => {
    const cb = setup()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }))
    expect(cb.onLetter).not.toHaveBeenCalled()
  })

  it('when disabled, moves are ignored but onAnyKey still runs', () => {
    const onAnyKey = vi.fn()
    const cb = setup({ enabled: false, onAnyKey })
    press('a')
    expect(onAnyKey).toHaveBeenCalledTimes(1)
    expect(cb.onLetter).not.toHaveBeenCalled()
  })

  it('onAnyKey returning true CONSUMES the key (scrabble turn-viewer exit)', () => {
    const onAnyKey = vi.fn(() => true)
    const cb = setup({ onAnyKey })
    press('a')
    expect(onAnyKey).toHaveBeenCalledTimes(1)
    expect(cb.onLetter).not.toHaveBeenCalled() // consumed
  })

  it('ignores keystrokes aimed at a focused text field (chat isolation)', () => {
    const cb = setup()
    const input = document.createElement('input')
    document.body.append(input)
    press('a', input)
    press('ArrowLeft', input)
    expect(cb.onLetter).not.toHaveBeenCalled()
    expect(cb.onArrow).not.toHaveBeenCalled()
  })
})
