// cs-audited-feedback

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDismissLocalFeedbackOnKey } from './useDismissLocalFeedbackOnKey'
import { useActionDispatcher } from '../actions/dispatcher'

/** Dispatch a bubbling keydown whose `target` is the given element. Awaited:
 *  an action's run settles a microtask after the key. */
async function press(target: EventTarget, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, ...init }))
  })
}

describe('useDismissLocalFeedbackOnKey', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('dismisses local feedback on a bare keypress with nothing focused', async () => {
    const dismiss = vi.fn()
    renderHook(() => {
      useActionDispatcher()
      useDismissLocalFeedbackOnKey(dismiss)
    })
    await press(document.body)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('ignores modifier chords (Cmd-R / Ctrl-C etc. are not a move)', async () => {
    const dismiss = vi.fn()
    renderHook(() => {
      useActionDispatcher()
      useDismissLocalFeedbackOnKey(dismiss)
    })
    await press(document.body, { metaKey: true })
    await press(document.body, { ctrlKey: true })
    await press(document.body, { altKey: true })
    expect(dismiss).not.toHaveBeenCalled()
  })

  // Inherited from the dispatcher: a key aimed at a focused field (chat, a
  // game input) never reaches here — so typing in chat can't wipe game feedback.
  it('ignores keystrokes aimed at a focused text field', async () => {
    const dismiss = vi.fn()
    renderHook(() => {
      useActionDispatcher()
      useDismissLocalFeedbackOnKey(dismiss)
    })
    const input = document.createElement('input')
    document.body.append(input)
    await press(input)
    expect(dismiss).not.toHaveBeenCalled()
  })
})
