// cs-audited-session

/**
 * Tests for the profile store — the one slot every page reads the signed-in
 * user's name, color and dictionary permission from.
 *
 * What fills it is `useSession`'s probe, and that half is pinned in
 * `useSession.test.ts`. These cases are about the store itself: a value reaches
 * every reader at once, clearing it reaches them too, and a saved color
 * repaints with no refetch — the reason the profile lives in a store rather
 * than in each component that wants it.
 *
 * The store is module state and outlives a render, so each case starts by
 * emptying it.
 */

import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setProfile, setProfileColor, useProfile } from './useProfile'

const ADA = { username: 'ada', color: '#c0392b', can_edit_words: false }

beforeEach(() => {
  setProfile(null)
})

describe('the profile store', () => {
  it('hands the same profile to every reader', () => {
    // Two readers with no parent in common: the account menu and the greeting.
    const menu = renderHook(() => useProfile())
    const greeting = renderHook(() => useProfile())
    expect(menu.result.current).toBeNull()

    act(() => {
      setProfile(ADA)
    })

    expect(menu.result.current).toEqual(ADA)
    expect(greeting.result.current).toEqual(ADA)
  })

  it('empties for every reader at once', () => {
    const menu = renderHook(() => useProfile())
    const greeting = renderHook(() => useProfile())
    act(() => {
      setProfile(ADA)
    })

    act(() => {
      setProfile(null)
    })

    expect(menu.result.current).toBeNull()
    expect(greeting.result.current).toBeNull()
  })

  it('repaints a saved color everywhere, leaving the rest of the row alone', () => {
    const menu = renderHook(() => useProfile())
    const greeting = renderHook(() => useProfile())
    act(() => {
      setProfile(ADA)
    })

    act(() => {
      setProfileColor('#2980b9')
    })

    expect(menu.result.current).toEqual({ ...ADA, color: '#2980b9' })
    expect(greeting.result.current).toEqual({ ...ADA, color: '#2980b9' })
  })

  it('ignores a color save when there is no profile to save it into', () => {
    // Nothing on screen can reach the color picker in this state; the guard is
    // there so a stray call cannot invent a profile out of a color.
    const reader = renderHook(() => useProfile())

    act(() => {
      setProfileColor('#2980b9')
    })

    expect(reader.result.current).toBeNull()
  })
})
