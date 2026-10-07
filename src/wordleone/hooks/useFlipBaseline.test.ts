// cs-unmet

/**
 * Which rows flip: the ones that land while you watch, never the ones already
 * there — including the live rows coming back after a past turn was open.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFlipBaseline } from './useFlipBaseline'

function setup(nLiveRows: number) {
  return renderHook(
    ({ count, isViewing }) => useFlipBaseline(count, isViewing),
    { initialProps: { count: nLiveRows, isViewing: false } },
  )
}

describe('useFlipBaseline', () => {
  it('starts at the rows already on the board, so none of them flips', () => {
    expect(setup(3).result.current).toBe(3)
  })

  it('stays put as rows land, so each new one flips', () => {
    const { result, rerender } = setup(3)
    rerender({ count: 4, isViewing: false })
    expect(result.current).toBe(3)
  })

  it('moves up to the live rows when a past turn opens, and stays there on the way back', () => {
    const { result, rerender } = setup(3)
    rerender({ count: 4, isViewing: false })
    rerender({ count: 4, isViewing: true })
    expect(result.current).toBe(4)
    // A row lands while the past turn is open; it still flips once I'm back.
    rerender({ count: 5, isViewing: true })
    rerender({ count: 5, isViewing: false })
    expect(result.current).toBe(4)
  })
})
