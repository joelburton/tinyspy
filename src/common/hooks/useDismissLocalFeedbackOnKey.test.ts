import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDismissLocalFeedbackOnKey } from './useDismissLocalFeedbackOnKey'

/** Dispatch a bubbling keydown whose `target` is the given element. */
function press(target: EventTarget, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, ...init }))
}

describe('useDismissLocalFeedbackOnKey', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('clears local feedback on a bare keypress with nothing focused', () => {
    const clear = vi.fn()
    renderHook(() => useDismissLocalFeedbackOnKey(clear))
    press(document.body)
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('ignores modifier chords (Cmd-R / Ctrl-C etc. are not a move)', () => {
    const clear = vi.fn()
    renderHook(() => useDismissLocalFeedbackOnKey(clear))
    press(document.body, { metaKey: true })
    press(document.body, { ctrlKey: true })
    press(document.body, { altKey: true })
    expect(clear).not.toHaveBeenCalled()
  })

  // Inherited from useGlobalKeyHandler: a key aimed at a focused field (chat, a
  // game input) never reaches here — so typing in chat can't wipe game feedback.
  it('ignores keystrokes aimed at a focused text field', () => {
    const clear = vi.fn()
    renderHook(() => useDismissLocalFeedbackOnKey(clear))
    const input = document.createElement('input')
    document.body.append(input)
    press(input)
    expect(clear).not.toHaveBeenCalled()
  })
})
