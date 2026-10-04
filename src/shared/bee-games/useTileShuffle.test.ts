// cs-unmet

/**
 * The display order: the puzzle's letters until the first shuffle, a
 * permutation of the same letters after it, and the same order again when the
 * letters come back as a fresh string.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTileShuffle } from './useTileShuffle'

describe('useTileShuffle', () => {
  // Fisher–Yates on `Math.random`: a pinned value is a fixed permutation, so
  // "a different order of the same letters" is a deterministic claim. 0 rotates
  // the list; ~1 leaves it alone.
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hands back the same letters, rearranged, on a shuffle', () => {
    const { result } = renderHook(() => useTileShuffle('abcdfg'))
    expect(result.current.outerLetters).toEqual(['a', 'b', 'c', 'd', 'f', 'g'])

    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void result.current.actShuffle.run())
    const after = result.current.outerLetters
    expect(after).not.toEqual(['a', 'b', 'c', 'd', 'f', 'g'])
    expect([...after].sort()).toEqual(['a', 'b', 'c', 'd', 'f', 'g'])
  })

  it('keeps its order across a reload that hands the same letters again', () => {
    const { result, rerender } = renderHook(({ letters }) => useTileShuffle(letters), {
      initialProps: { letters: 'abcdfg' },
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void result.current.actShuffle.run())
    const after = result.current.outerLetters

    rerender({ letters: 'abcdfg' })
    expect(result.current.outerLetters).toBe(after)
  })

  it('is live in every state', () => {
    const { result } = renderHook(() => useTileShuffle('abcdfg'))
    expect(result.current.actShuffle.describe('button').state).toBe('active')
  })
})
