// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSelectionCursor } from './useSelectionCursor'

// The rules every selection cursor keeps alike: hidden until a movement key
// asks, a relative key's first press only reveals, an absolute key reveals and
// goes, a click goes and hides.

describe('useSelectionCursor', () => {
  it('starts hidden, at the start', () => {
    const { result } = renderHook(() => useSelectionCursor(0))
    expect(result.current).toMatchObject({ at: 0, revealed: false })
  })

  it('a relative key’s first press reveals without moving; the next one moves', () => {
    const { result } = renderHook(() => useSelectionCursor(0))
    act(() => result.current.step(1))
    expect(result.current).toMatchObject({ at: 0, revealed: true })
    act(() => result.current.step(1))
    expect(result.current).toMatchObject({ at: 1, revealed: true })
  })

  it('an absolute key reveals and moves in one press', () => {
    const { result } = renderHook(() => useSelectionCursor(0))
    act(() => result.current.jump(4))
    expect(result.current).toMatchObject({ at: 4, revealed: true })
  })

  it('a click moves the cursor and hides it, and the next key resumes there', () => {
    const { result } = renderHook(() => useSelectionCursor(0))
    act(() => result.current.jump(4))
    act(() => result.current.point(2))
    expect(result.current).toMatchObject({ at: 2, revealed: false })
    act(() => result.current.step(3))
    expect(result.current).toMatchObject({ at: 2, revealed: true })
  })
})
