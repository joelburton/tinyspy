// cs-blessed-keyboard

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/** Dispatch a bubbling keydown whose `target` is the given element. */
function press(target: EventTarget) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
}

describe('useGlobalKeyHandler', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('dispatches keystrokes aimed at the page (board input)', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalKeyHandler(handler))
    press(document.body)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // The bug this guards: typing in the chat box also drove the game board.
  it('ignores keystrokes aimed at a focused text field', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalKeyHandler(handler))

    for (const tag of ['input', 'textarea', 'select'] as const) {
      const el = document.createElement(tag)
      document.body.append(el)
      press(el)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores keystrokes aimed inside a floating panel — the panel owns them', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalKeyHandler(handler))
    const panel = document.createElement('div')
    panel.dataset.floatingPanel = ''
    const button = document.createElement('button')
    panel.append(button)
    document.body.append(panel)
    press(button)
    expect(handler).not.toHaveBeenCalled()
  })

  it('always dispatches into the latest handler (ref stays fresh, listens once)', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ h }) => useGlobalKeyHandler(h), {
      initialProps: { h: first },
    })
    rerender({ h: second })
    press(document.body)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
