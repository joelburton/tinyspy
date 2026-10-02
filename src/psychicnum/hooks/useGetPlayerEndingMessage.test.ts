// cs-unmet

/**
 * When psychicnum has a player-ending message and when it doesn't. What the
 * message says is `buildPlayerEndingMessage`'s, tested beside it.
 */
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { PlayerEndedReason } from '@/common/terminal/gameEnding'
import { makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useGetPlayerEndingMessage } from './useGetPlayerEndingMessage'
import type { GGameData } from '../types'

/** A compete game with my ending overridable. */
function gdWith(over: {
  ended?: boolean
  reason?: PlayerEndedReason
}): GGameData {
  return makeGameData(
    makeGameDataRaw({
      mode: 'compete',
      players: [
        {
          id: 'u1', username: 'me', color: 'red',
          ending: over.reason ? { at: '2026-09-29T00:00:00Z', reason: over.reason, detail: over.reason } : null,
          // The database writes the outcome in the same update as the reason.
          outcome: over.reason ? 'lost' : null,
        },
        { id: 'u2', username: 'moth', color: 'blue' },
      ],
      ending: over.ended ? { reason: 'stopped', detail: 'stopped', by: 'u2', winner: null } : null,
      outcome: over.ended ? 'neutral' : null,
    }),
    'u1',
  )
}

function messageFor(gd: GGameData) {
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
    expect(messageFor(gdWith({ ended: true, reason: 'conceded' }))).toBeNull()
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
