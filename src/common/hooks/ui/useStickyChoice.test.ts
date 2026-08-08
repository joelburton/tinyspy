import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStickyChoice } from './useStickyChoice'

/**
 * The three decisions in `useStickyChoice`'s docstring, each pinned here —
 * they're the parts a future edit could quietly undo without breaking a render:
 * only an explicit choice is written, a stored value is validated before use,
 * and storage failures degrade to in-memory state.
 *
 * jsdom in this project ships no real `localStorage`, so we install a
 * Storage-shaped fake — the same approach, for the same reason, as
 * `common/lib/chat/chatOpenStore.test.ts` (see its longer note). Backed by a
 * Map, with methods on the prototype so `vi.spyOn` can make them throw.
 */
class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  clear(): void {
    this.store.clear()
  }
}

const KEY = 'test:choice'
const OPTIONS = ['all', 'coop', 'compete'] as const
type Choice = (typeof OPTIONS)[number]

const render = () => renderHook(() => useStickyChoice<Choice>(KEY, OPTIONS, 'all'))

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: new FakeStorage(),
    configurable: true,
  })
})

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('useStickyChoice', () => {
  it('falls back when nothing is stored, and mounting persists NOTHING', () => {
    const { result } = render()
    expect(result.current[0]).toBe('all')
    // The key must still be absent: a user who never touched the control has no
    // stored preference, so a later change of `fallback` still reaches them.
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('reads a valid stored value', () => {
    window.localStorage.setItem(KEY, 'compete')
    expect(render().result.current[0]).toBe('compete')
  })

  it('ignores a value that is not one of the options', () => {
    // A renamed option, an older build, a hand-edited key — must not wedge the
    // UI into a state its control cannot represent.
    window.localStorage.setItem(KEY, 'sabotage')
    expect(render().result.current[0]).toBe('all')
  })

  it('choosing updates the value and persists it', () => {
    const { result } = render()
    act(() => result.current[1]('coop'))
    expect(result.current[0]).toBe('coop')
    expect(window.localStorage.getItem(KEY)).toBe('coop')
    // …and a fresh mount picks it back up — the whole point.
    expect(render().result.current[0]).toBe('coop')
  })

  it('survives localStorage being unavailable, on read and on write', () => {
    const boom = () => {
      throw new Error('private mode')
    }
    vi.spyOn(FakeStorage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(FakeStorage.prototype, 'setItem').mockImplementation(boom)

    const { result } = render()
    expect(result.current[0]).toBe('all')
    // The choice still works; it just doesn't outlive the session.
    act(() => result.current[1]('compete'))
    expect(result.current[0]).toBe('compete')
  })
})
