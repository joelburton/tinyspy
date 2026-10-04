// cs-unmet

/**
 * The display order: the puzzle's tiles until the first shuffle, the same
 * tiles with the outers rearranged after it, the center first throughout, and
 * the same order again when the tiles come back rebuilt.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZTest_tilesOf } from './beeGameData.fixture'
import { useTileShuffle } from './useTileShuffle'

const TILES = ZTest_tilesOf('e', 'abcdfg')
const idsOf = (tiles: readonly { id: string }[]) => tiles.map((t) => t.id)

describe('useTileShuffle', () => {
  // Fisher–Yates on `Math.random`: a pinned value is a fixed permutation, so
  // "a different order of the same tiles" is a deterministic claim. 0 rotates
  // the list; ~1 leaves it alone.
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows the puzzle's own order until the first shuffle, then the same tiles rearranged", () => {
    const { result } = renderHook(() => useTileShuffle(TILES))
    expect(idsOf(result.current.tiles)).toEqual(idsOf(TILES))

    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void result.current.actShuffle.run())
    const after = idsOf(result.current.tiles)
    expect(after).not.toEqual(idsOf(TILES))
    expect([...after].sort()).toEqual(idsOf(TILES).sort())
  })

  it('keeps the center first', () => {
    const { result } = renderHook(() => useTileShuffle(TILES))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void result.current.actShuffle.run())
    expect(result.current.tiles[0]!.center).toBe(true)
  })

  it('keeps its order across a reload that hands the tiles rebuilt', () => {
    const { result, rerender } = renderHook(({ tiles }) => useTileShuffle(tiles), {
      initialProps: { tiles: TILES },
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => void result.current.actShuffle.run())
    const after = idsOf(result.current.tiles)

    rerender({ tiles: ZTest_tilesOf('e', 'abcdfg') })
    expect(idsOf(result.current.tiles)).toEqual(after)
  })

  it('is live in every state', () => {
    const { result } = renderHook(() => useTileShuffle(TILES))
    expect(result.current.actShuffle.describe('button').state).toBe('active')
  })
})
