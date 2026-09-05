// cs-blessed-web-storage

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeStorage, type InstalledStorage } from './storage.fake'
import { useStickyChoice } from './useStickyChoice'

/**
 * The three decisions in `useStickyChoice`'s docstring, each pinned here —
 * they're the parts a future edit could quietly undo without breaking a render:
 * only an explicit choice is written, a stored value is validated before use,
 * and storage failures degrade to in-memory state.
 *
 * That last one is really two, and both are here, because they fail in
 * different places: a browser blocking site data throws on
 * `window.localStorage` ITSELF, while a full quota throws on the method call.
 * The first is the one the wrapper is shaped around — it is why `readStored`
 * takes the NAME of a storage rather than the storage — so a suite that only
 * made the methods throw would still pass against a wrapper that had lost the
 * property access to its `try`.
 *
 * `storage.fake.ts` supplies both switches, and explains why a fake is needed
 * here at all.
 */

const KEY = 'test:choice'
const OPTIONS = ['all', 'coop', 'compete'] as const
type Choice = (typeof OPTIONS)[number]

const render = () => renderHook(() => useStickyChoice<Choice>(KEY, OPTIONS, 'all'))

let storage: InstalledStorage

beforeAll(() => {
  storage = installFakeStorage()
})

beforeEach(() => storage.clear())
afterEach(() => vi.restoreAllMocks())

describe('useStickyChoice', () => {
  it('falls back when nothing is stored, and mounting persists NOTHING', () => {
    const { result } = render()
    expect(result.current[0]).toBe('all')
    // The key must still be absent: a user who never touched the control has no
    // stored preference, so a later change of `fallback` still reaches them.
    expect(storage.local.getItem(KEY)).toBeNull()
  })

  it('reads a valid stored value', () => {
    storage.local.setItem(KEY, 'compete')
    expect(render().result.current[0]).toBe('compete')
  })

  it('ignores a value that is not one of the options', () => {
    // A renamed option, an older build, a hand-edited key — must not wedge the
    // UI into a state its control cannot represent.
    storage.local.setItem(KEY, 'sabotage')
    expect(render().result.current[0]).toBe('all')
  })

  it('choosing updates the value and persists it', () => {
    const { result } = render()
    act(() => result.current[1]('coop'))
    expect(result.current[0]).toBe('coop')
    expect(storage.local.getItem(KEY)).toBe('coop')
    // …and a fresh mount picks it back up — the whole point.
    expect(render().result.current[0]).toBe('coop')
  })

  it('survives the storage ACCESS throwing — a browser blocking site data', () => {
    storage.blockAccess()
    const { result } = render()
    expect(result.current[0]).toBe('all')
    // The choice still works; it just doesn't outlive the session.
    act(() => result.current[1]('compete'))
    expect(result.current[0]).toBe('compete')
  })

  it('survives the storage CALLS throwing — a full quota', () => {
    storage.failCalls()
    const { result } = render()
    expect(result.current[0]).toBe('all')
    act(() => result.current[1]('compete'))
    expect(result.current[0]).toBe('compete')
  })
})
