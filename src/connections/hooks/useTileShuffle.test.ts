// cs-unmet

/**
 * The display order: the board's own until the first shuffle, this client's
 * permutation after it, with a matched category's tiles dropping out and every
 * other tile staying put. The reconciling itself is lib/localOrder.test.ts's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTileShuffle } from './useTileShuffle'

const TILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTileShuffle', () => {
  it('shows the board\'s own order until the first shuffle', () => {
    const { result } = renderHook(() => useTileShuffle({ remainingTiles: TILES, canShuffle: true }))
    expect(result.current.displayedTiles).toEqual(TILES)
    expect(result.current.actShuffle.describe('button').state).toBe('active')
  })

  it('rearranges the same tiles, and keeps the arrangement when a band takes four away', () => {
    // Fisher–Yates on a pinned 0 rotates the list: a fixed, different permutation.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { result, rerender } = renderHook(
      ({ remainingTiles }: { remainingTiles: string[] }) =>
        useTileShuffle({ remainingTiles, canShuffle: true }),
      { initialProps: { remainingTiles: TILES } },
    )
    act(() => result.current.actShuffle.run())
    const shuffled = result.current.displayedTiles
    expect(shuffled).not.toEqual(TILES)
    expect([...shuffled].sort()).toEqual([...TILES].sort())

    // The first category matched: its four leave, the others stay where they were.
    rerender({ remainingTiles: ['e', 'f', 'g', 'h'] })
    expect(result.current.displayedTiles).toEqual(shuffled.filter((t) => 'efgh'.includes(t)))
  })

  it('hides the Shuffle where the board cannot be shuffled', () => {
    const { result } = renderHook(() => useTileShuffle({ remainingTiles: TILES, canShuffle: false }))
    expect(result.current.actShuffle.describe('button').state).toBe('hidden')
    expect(result.current.actShuffle.describe('menu').state).toBe('hidden')
  })
})
