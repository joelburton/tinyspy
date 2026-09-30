// cs-unmet

/**
 * When psychicnum has a player-ending message and when it doesn't. What the
 * message says is `buildPlayerEndingMessage`'s, tested beside it.
 */
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { GameData } from './useGame'
import { useGetPlayerEndingMessage } from './useGetPlayerEndingMessage'

/** A compete game with my ending overridable; only what the hook reads. */
function gdWith(over: {
  isGameEnded?: boolean
  reason?: PlayerEndedReason
}): GameData {
  const playerEnding = over.reason
    ? { at: '2026-09-29T00:00:00Z', reason: over.reason, reasonDetail: over.reason }
    : null
  // The database writes the outcome in the same update as the reason.
  const outcome = over.reason ? 'lost' : null
  return {
    isGameEnded: over.isGameEnded ?? false,
    me: { playerEnding, outcome },
  } as unknown as GameData
}

function messageFor(gd: GameData) {
  return renderHook(() => useGetPlayerEndingMessage(gd)).result.current
}

describe('useGetPlayerEndingMessage', () => {
  it('is null while I can still play', () => {
    expect(messageFor(gdWith({}))).toBeNull()
  })

  it('is my ending\'s message once I have ended', () => {
    expect(messageFor(gdWith({ reason: 'conceded' }))?.infoColText).toBe('You conceded')
  })

  it('is null once the game has ended, when the game ending replaces it', () => {
    expect(messageFor(gdWith({ isGameEnded: true, reason: 'conceded' }))).toBeNull()
  })

  it('keeps its identity while my ending holds', () => {
    let gd = gdWith({ reason: 'resource_exhausted' })
    const { result, rerender } = renderHook(() => useGetPlayerEndingMessage(gd))
    const first = result.current
    gd = gdWith({ reason: 'resource_exhausted' })
    rerender()
    expect(result.current).toBe(first)
  })
})
