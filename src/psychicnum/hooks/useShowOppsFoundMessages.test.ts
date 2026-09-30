// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { GameData, PsychicnumPlayer } from './useGame'
import { useShowOppsFoundMessages } from './useShowOppsFoundMessages'

/** A player with a count of secrets found; nothing else here is read. */
function player(userId: string, username: string, found: number): PsychicnumPlayer {
  return {
    user_id: userId, username, color: 'blue', playerEnding: null, outcome: null,
    finalRanking: null, solvedAt: null, foundSecretsCount: found, guessesUsed: 0,
    foundAllSecrets: false,
  }
}

/** Just the two fields of `gd` the hook reads. */
function gdWith(isCompete: boolean, mine: number, moths: number): GameData {
  return {
    isCompete,
    players: [player('u1', 'me', mine), player('u2', 'moth', moths)],
  } as unknown as GameData
}

/** Mount the hook for me (u1) with a spy on the header slot. */
function setup(initial: GameData) {
  const slot = createFeedbackSlot('global')
  const shown = vi.spyOn(slot, 'show')
  const { rerender } = renderHook(
    (gd: GameData) => useShowOppsFoundMessages(gd, 'u1', slot),
    { initialProps: initial },
  )
  return { shown, rerender }
}

describe('useShowOppsFoundMessages', () => {
  it('stays quiet on the first pass, so opening a game replays no history', () => {
    const { shown } = setup(gdWith(true, 0, 2))
    expect(shown).not.toHaveBeenCalled()
  })

  it('announces an opponent whose count goes up', () => {
    const { shown, rerender } = setup(gdWith(true, 0, 1))
    rerender(gdWith(true, 0, 2))
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('never announces my own finds', () => {
    const { shown, rerender } = setup(gdWith(true, 0, 0))
    rerender(gdWith(true, 1, 0))
    expect(shown).not.toHaveBeenCalled()
  })

  it('says nothing in coop', () => {
    const { shown, rerender } = setup(gdWith(false, 0, 0))
    rerender(gdWith(false, 0, 1))
    expect(shown).not.toHaveBeenCalled()
  })
})
