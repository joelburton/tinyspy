// cs-unmet

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWordShuffle } from './useWordShuffle'

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']

describe('useWordShuffle', () => {
  it('draws every word once', () => {
    const { result } = renderHook(() => useWordShuffle(WORDS))
    expect([...result.current.shuffledWords].sort()).toEqual([...WORDS].sort())
  })

  // A reload hands a fresh array of the same words; the board must not
  // reshuffle on every guess.
  it('keeps its order across a fresh array of the same words', () => {
    const { result, rerender } = renderHook((words: string[]) => useWordShuffle(words), {
      initialProps: [...WORDS],
    })
    const first = result.current.shuffledWords
    rerender([...WORDS])
    expect(result.current.shuffledWords).toBe(first)
  })

  it('Shuffle deals a new order of the same words', () => {
    const { result } = renderHook(() => useWordShuffle(WORDS))
    const first = result.current.shuffledWords
    act(() => result.current.actShuffle.run())
    expect(result.current.shuffledWords).not.toBe(first)
    expect([...result.current.shuffledWords].sort()).toEqual([...WORDS].sort())
  })
})
