// cs-unmet

/**
 * The display order: the board's own until the first shuffle, this client's
 * permutation after it, with a matched category's tiles dropping out and every
 * other tile staying put. The reconciling itself is lib/localOrder.test.ts's.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ZTest_tile } from '../lib/gameData.fixture'
import { useTileShuffle } from './useTileShuffle'
import type { GTile } from '../types'

const TILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(ZTest_tile)
const idsOf = (tiles: readonly GTile[]) => tiles.map((t) => t.id)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTileShuffle', () => {
  it('shows the board\'s own order until the first shuffle', () => {
    const { result } = renderHook(() => useTileShuffle({ tilesLeft: TILES, canShuffle: true }))
    expect(result.current.tiles).toEqual(TILES)
    expect(result.current.actShuffle.describe('button').state).toBe('active')
  })

  it('rearranges the same tiles, and keeps the arrangement when a band takes four away', () => {
    // Fisher–Yates on a pinned 0 rotates the list: a fixed, different permutation.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { result, rerender } = renderHook(
      ({ tilesLeft }: { tilesLeft: GTile[] }) =>
        useTileShuffle({ tilesLeft, canShuffle: true }),
      { initialProps: { tilesLeft: TILES } },
    )
    act(() => result.current.actShuffle.run())
    const shuffled = idsOf(result.current.tiles)
    expect(shuffled).not.toEqual(idsOf(TILES))
    expect([...shuffled].sort()).toEqual(idsOf(TILES).sort())

    // The first category matched: its four leave, the others stay where they
    // were — and the tiles handed back are the fresh array's, not the old.
    const left = ['e', 'f', 'g', 'h'].map(ZTest_tile)
    rerender({ tilesLeft: left })
    expect(idsOf(result.current.tiles)).toEqual(shuffled.filter((id) => 'efgh'.includes(id)))
    expect(result.current.tiles.every((t) => left.includes(t))).toBe(true)
  })

  it('hides the Shuffle where the board cannot be shuffled', () => {
    const { result } = renderHook(() => useTileShuffle({ tilesLeft: TILES, canShuffle: false }))
    expect(result.current.actShuffle.describe('button').state).toBe('hidden')
    expect(result.current.actShuffle.describe('menu').state).toBe('hidden')
  })
})
