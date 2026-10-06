// cs-unmet

/**
 * wordwheel's `useGame`: `gd` from the blob the page was handed, with this
 * game's setup rows. The reading itself is the bee games' shared one, tested
 * in `shared/bee-games/beeGameData.test.ts`.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZTest_makeGameDataRaw, ZTest_makeWordwheelCtx } from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

describe('wordwheel useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeWordwheelCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.puzzle.centerLetter).toBe('e')
  })

  it('builds the setup rows with the board\'s letters', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('letters')
    expect(gd.setupRows.find((r) => r.key === 'letters')?.value).toBe('E-ABCDFGHI')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeWordwheelCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeWordwheelCtx({ players: TWO, targetRankIdx: 2 }))
    expect(result.current.gd).not.toBe(first)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeWordwheelCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
