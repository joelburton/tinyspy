// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useShowOppsFoundMessages } from './useShowOppsFoundMessages'
import type { GGameData } from '../types'

/** Me and moth, with the secrets each has found. */
function gdWith(mode: 'coop' | 'compete', mine: number, moths: number): GGameData {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode,
      players: [
        { id: 'u1', username: 'me', color: 'red', found: mine },
        { id: 'u2', username: 'moth', color: 'blue', found: moths },
      ],
    }),
    'u1',
  )
}

/** Mount the hook for me (u1) with a spy on the header slot. */
function setup(initial: GGameData) {
  const slot = createFeedbackSlot('global')
  const shown = vi.spyOn(slot, 'show')
  const { rerender } = renderHook(
    (gd: GGameData) => useShowOppsFoundMessages(gd, 'u1', slot),
    { initialProps: initial },
  )
  return { shown, rerender }
}

describe('useShowOppsFoundMessages', () => {
  it('stays quiet on the first pass, so opening a game replays no history', () => {
    const { shown } = setup(gdWith('compete', 0, 2))
    expect(shown).not.toHaveBeenCalled()
  })

  it('announces an opponent whose count goes up', () => {
    const { shown, rerender } = setup(gdWith('compete', 0, 1))
    rerender(gdWith('compete', 0, 2))
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('never announces my own finds', () => {
    const { shown, rerender } = setup(gdWith('compete', 0, 0))
    rerender(gdWith('compete', 1, 0))
    expect(shown).not.toHaveBeenCalled()
  })

  it('says nothing in coop', () => {
    const { shown, rerender } = setup(gdWith('coop', 0, 0))
    rerender(gdWith('coop', 0, 1))
    expect(shown).not.toHaveBeenCalled()
  })
})
