// cs-unmet

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTileShuffle } from './useTileShuffle'

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']

describe('useTileShuffle', () => {
  it('draws every word once', () => {
    const { result } = renderHook(() => useTileShuffle(WORDS))
    expect([...result.current.tiles].sort()).toEqual([...WORDS].sort())
  })

  // A reload hands a fresh array of the same words; the board must not
  // reshuffle on every guess.
  it('keeps its order across a fresh array of the same words', () => {
    const { result, rerender } = renderHook((words: string[]) => useTileShuffle(words), {
      initialProps: [...WORDS],
    })
    const first = result.current.tiles
    rerender([...WORDS])
    expect(result.current.tiles).toBe(first)
  })

  it('Shuffle deals a new order of the same words', () => {
    const { result } = renderHook(() => useTileShuffle(WORDS))
    const first = result.current.tiles
    act(() => result.current.actShuffle.run())
    expect(result.current.tiles).not.toBe(first)
    expect([...result.current.tiles].sort()).toEqual([...WORDS].sort())
  })
})
