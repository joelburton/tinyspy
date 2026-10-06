// cs-unmet

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeGameData } from './useGame'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { useLandMove } from './useLandMove'
import type { GHistoryView } from '../types'

const RACE = { mode: 'compete' as const, players: [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
] }

/** The hook over a game at `version`, its neighbors stubbed; `myMove` is the
 *  claim a move of mine left, or null. */
function setup(myMove: { slots: { removed: Set<number>; oldLen: number }; nDrawn: number } | null) {
  const submission = { takeMyMove: vi.fn(() => myMove), clearHeldTiles: vi.fn() }
  const staged = { clearPicks: vi.fn(), recallAll: vi.fn(), dropIfCovered: vi.fn() }
  const rackOrder = { rebuild: vi.fn() }
  const historyView = { exit: vi.fn() } as unknown as GHistoryView
  const props = (version: number) => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ ...RACE, version }), 'u1')
    return {
      gd,
      rack: gd.me.rack!,
      historyView,
      submission: submission as never,
      staged: staged as never,
      rackOrder: rackOrder as never,
    }
  }
  const view = renderHook((p) => useLandMove(p), { initialProps: props(0) })
  return { view, props, submission, staged, rackOrder }
}

describe('useLandMove', () => {
  it('does nothing until the version moves', () => {
    const { view, props, staged } = setup(null)
    view.rerender(props(0))
    expect(staged.clearPicks).not.toHaveBeenCalled()
  })

  it('a move of mine clears what was staged and rebuilds the rack from my claim', () => {
    const slots = { removed: new Set([0, 1]), oldLen: 7 }
    const { view, props, staged, rackOrder } = setup({ slots, nDrawn: 2 })
    view.rerender(props(1))
    expect(staged.recallAll).toHaveBeenCalled()
    expect(rackOrder.rebuild).toHaveBeenCalledWith(slots, 2, 7)
  })

  it('an opponent\'s move in a race keeps my laid-out move unless it took one of its cells', () => {
    const { view, props, staged, rackOrder } = setup(null)
    view.rerender(props(1))
    expect(staged.dropIfCovered).toHaveBeenCalled()
    expect(staged.recallAll).not.toHaveBeenCalled()
    expect(rackOrder.rebuild).not.toHaveBeenCalled()
  })
})
