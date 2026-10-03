// cs-unmet

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTileShuffle } from './useTileShuffle'
import type { GTile } from '../types'

const tile = (word: string): GTile => ({ id: word, word, correct: null, outcome: null, decidedBy: null })
const TILES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(tile)
const idsOf = (tiles: readonly GTile[]) => tiles.map((t) => t.id)

describe('useTileShuffle', () => {
  it('draws every tile once', () => {
    const { result } = renderHook(() => useTileShuffle(TILES))
    expect(idsOf(result.current.tiles).sort()).toEqual(idsOf(TILES).sort())
  })

  // A reload hands fresh tiles with the same ids; the board must not
  // reshuffle on every guess, and must hand back the NEW tiles in the old order.
  it('keeps its order across fresh tiles with the same ids, and hands back the fresh ones', () => {
    const { result, rerender } = renderHook((tiles: GTile[]) => useTileShuffle(tiles), {
      initialProps: [...TILES],
    })
    const firstOrder = idsOf(result.current.tiles)
    const fresh = TILES.map((t) => ({ ...t }))
    rerender(fresh)
    expect(idsOf(result.current.tiles)).toEqual(firstOrder)
    expect(result.current.tiles.every((t) => fresh.includes(t))).toBe(true)
  })

  it('Shuffle deals a new order of the same tiles', () => {
    const { result } = renderHook(() => useTileShuffle(TILES))
    const first = idsOf(result.current.tiles)
    act(() => result.current.actShuffle.run())
    expect(idsOf(result.current.tiles)).not.toEqual(first)
    expect(idsOf(result.current.tiles).sort()).toEqual(idsOf(TILES).sort())
  })
})
