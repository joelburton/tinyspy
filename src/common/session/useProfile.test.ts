// cs-blessed-session

/**
 * Tests for the profile store — the one slot every page reads the signed-in
 * user's name, color and dictionary permission from.
 *
 * What fills it is `useAuthSession`'s probe, and that half is pinned in
 * `useAuthSession.test.ts`. These cases are about the store itself: a value reaches
 * every reader at once, clearing it reaches them too, and a saved color
 * repaints with no refetch — the reason the profile lives in a store rather
 * than in each component that wants it.
 *
 * The store is module state and outlives a render, so each case starts by
 * emptying it.
 */

import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getMyProfile, setMyProfile, setMyProfileFields, useMyProfile } from './useProfile'

const ADA = { username: 'ada', color: '#c0392b', can_edit_words: false, sounds_enabled: true }

beforeEach(() => {
  setMyProfile(null)
})

describe('the profile store', () => {
  it('hands the same profile to every reader', () => {
    // Two readers with no parent in common: the account menu and the greeting.
    const menu = renderHook(() => useMyProfile())
    const greeting = renderHook(() => useMyProfile())
    expect(menu.result.current).toBeNull()

    act(() => {
      setMyProfile(ADA)
    })

    expect(menu.result.current).toEqual(ADA)
    expect(greeting.result.current).toEqual(ADA)
  })

  it('empties for every reader at once', () => {
    const menu = renderHook(() => useMyProfile())
    const greeting = renderHook(() => useMyProfile())
    act(() => {
      setMyProfile(ADA)
    })

    act(() => {
      setMyProfile(null)
    })

    expect(menu.result.current).toBeNull()
    expect(greeting.result.current).toBeNull()
  })

  it('repaints a saved profile everywhere, leaving the rest of the row alone', () => {
    const menu = renderHook(() => useMyProfile())
    const greeting = renderHook(() => useMyProfile())
    act(() => {
      setMyProfile(ADA)
    })

    act(() => {
      setMyProfileFields({ color: '#2980b9', sounds_enabled: false })
    })

    const saved = { ...ADA, color: '#2980b9', sounds_enabled: false }
    expect(menu.result.current).toEqual(saved)
    expect(greeting.result.current).toEqual(saved)
  })

  it('ignores a save when there is no profile to save it into', () => {
    // Nothing on screen can reach the dialog in this state; the guard is there
    // so a stray call cannot invent a profile out of two fields.
    const reader = renderHook(() => useMyProfile())

    act(() => {
      setMyProfileFields({ color: '#2980b9', sounds_enabled: false })
    })

    expect(reader.result.current).toBeNull()
  })

  it('answers a read from outside a render with what the store holds', () => {
    // `playSound` runs from effects and handlers, where no hook can be called.
    expect(getMyProfile()).toBeNull()
    setMyProfile(ADA)
    expect(getMyProfile()).toEqual(ADA)
  })
})
