import { afterEach, describe, expect, it, vi } from 'vitest'
import { backtickToEscape } from './useBacktickEscape'

/**
 * The window listener is a thin wrapper; the logic worth testing is
 * `backtickToEscape`. We can't dispatch a real trusted event in jsdom
 * (`isTrusted` is always false for `dispatchEvent`), so we drive the pure
 * core with mock events and assert it re-dispatches an Escape keydown.
 */

/** Build a mock KeyboardEvent with sensible defaults + preventDefault /
 *  stopPropagation spies. Override any field per case. */
function mockEvent(over: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    isTrusted: true,
    key: '`',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('backtickToEscape', () => {
  it('re-dispatches an Escape keydown on the focused element for a bare backtick', () => {
    const dispatch = vi.spyOn(document.body, 'dispatchEvent')
    const e = mockEvent()

    expect(backtickToEscape(e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    const dispatched = dispatch.mock.calls[0]![0] as KeyboardEvent
    expect(dispatched.type).toBe('keydown')
    expect(dispatched.key).toBe('Escape')
  })

  it('ignores untrusted events (so it never reacts to a synthetic re-dispatch)', () => {
    const dispatch = vi.spyOn(document.body, 'dispatchEvent')
    expect(backtickToEscape(mockEvent({ isTrusted: false }))).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores non-backtick keys', () => {
    const dispatch = vi.spyOn(document.body, 'dispatchEvent')
    expect(backtickToEscape(mockEvent({ key: 'a' }))).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('passes modified backticks through (so ⌥` / ⌘` shortcuts still work)', () => {
    const dispatch = vi.spyOn(document.body, 'dispatchEvent')
    for (const mod of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) {
      expect(backtickToEscape(mockEvent({ [mod]: true }))).toBe(false)
    }
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('ignores a backtick mid-IME-composition', () => {
    const dispatch = vi.spyOn(document.body, 'dispatchEvent')
    expect(backtickToEscape(mockEvent({ isComposing: true }))).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
