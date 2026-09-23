// cs-unmet

/**
 * The bell rings on the turn's arrival and at no other moment. `playSound` is
 * mocked: whether a ring is AUDIBLE is its business, pinned in its own test.
 */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPlay } = vi.hoisted(() => ({ mockPlay: vi.fn(() => () => {}) }))
vi.mock('./playSound', () => ({ playSound: mockPlay, preloadSound: vi.fn() }))

import { useTurnBell } from './useTurnBell'

beforeEach(() => {
  mockPlay.mockClear()
})

describe('useTurnBell', () => {
  it('does not ring on mount, even when it is already my turn', () => {
    renderHook(() => useTurnBell(true))
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('rings once when the turn becomes mine, and again on the next arrival', () => {
    const { rerender } = renderHook(({ mine }) => useTurnBell(mine), { initialProps: { mine: false } })
    rerender({ mine: true })
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockPlay).toHaveBeenCalledWith('bell')

    rerender({ mine: true }) // still mine
    rerender({ mine: false }) // leaving
    expect(mockPlay).toHaveBeenCalledTimes(1)

    rerender({ mine: true })
    expect(mockPlay).toHaveBeenCalledTimes(2)
  })
})
