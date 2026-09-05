// cs-blessed-mobile

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia, type InstalledMatchMedia } from './matchMedia.fake'
import { useMediaQuery } from './useMediaQuery'

/**
 * The engine behind every device hook, so what is pinned here is what those
 * hooks silently promise: the answer is right now, it CHANGES when the device
 * does, it stops listening when the component goes, and it has an answer where
 * there is no `matchMedia` to ask.
 *
 * That last one is not a corner: jsdom has no `matchMedia`, so it is the branch
 * every other component test in the repo takes, and the reason a test snapshot
 * renders the desktop layout.
 */

const QUERY = '(max-width: 40rem)'

let mm: InstalledMatchMedia

beforeEach(() => {
  mm = installFakeMatchMedia()
})
afterEach(() => mm.uninstall())

describe('useMediaQuery', () => {
  it('answers with the query state at the moment it renders', () => {
    mm.set(QUERY, true)
    expect(renderHook(() => useMediaQuery(QUERY)).result.current).toBe(true)
  })

  it('re-renders when the query flips', () => {
    const { result } = renderHook(() => useMediaQuery(QUERY))
    expect(result.current).toBe(false)

    // The reason this is a subscription and not a one-shot read: a rotation or a
    // window drag has to reach the component that asked.
    act(() => mm.set(QUERY, true))
    expect(result.current).toBe(true)

    act(() => mm.set(QUERY, false))
    expect(result.current).toBe(false)
  })

  it('stops listening when the component unmounts', () => {
    const { unmount } = renderHook(() => useMediaQuery(QUERY))
    expect(mm.listenerCount(QUERY)).toBe(1)

    // A leak here is one listener per mounted menu, panel and board — invisible
    // in every other assertion, since a leaked listener still reports correctly.
    unmount()
    expect(mm.listenerCount(QUERY)).toBe(0)
  })

  it('reads as unmatched where there is no matchMedia', () => {
    mm.set(QUERY, true)
    mm.uninstall()

    // Desktop-first, and the default this repo's whole test suite runs on.
    expect(renderHook(() => useMediaQuery(QUERY)).result.current).toBe(false)
  })
})
