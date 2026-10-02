// cs-unmet

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GameDataRaw } from '@/common/game-page/gameData'
import type { EndOutcome } from '@/common/terminal/gameEnding'
import { makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useGetGameEndingMessage } from './useGetGameEndingMessage'
import type { GGameData } from '../types'

const ME = { id: 'u1', username: 'me', color: 'red' }
const MOTH = { id: 'u2', username: 'moth', color: 'blue' }

/** A game with the ending the hook reads: who won it, and how I came out. */
function gdWith(o: {
  mode?: 'coop' | 'compete'
  ending: GameDataRaw['ending']
  outcome?: EndOutcome | null
  myOutcome?: EndOutcome | null
}): GGameData {
  return makeGameData(
    makeGameDataRaw({
      mode: o.mode ?? 'coop',
      players: [{ ...ME, outcome: o.myOutcome ?? null }, MOTH],
      ending: o.ending,
      outcome: o.outcome ?? (o.ending === null ? null : 'won'),
    }),
    'u1',
  )
}

const WON = { reason: 'reached_goal' as const, detail: 'solved', by: 'u1', winner: 'u1' }

describe('useGetGameEndingMessage', () => {
  it('is null while the game is played', () => {
    const { result } = renderHook(() => useGetGameEndingMessage(gdWith({ ending: null })))
    expect(result.current).toBeNull()
  })

  it('builds the message for the ending', () => {
    const { result } = renderHook(() =>
      useGetGameEndingMessage(gdWith({ ending: WON, myOutcome: 'won' })),
    )
    expect(result.current).toEqual({ pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' })
  })

  it('names compete\'s winner when it is not me', () => {
    const { result } = renderHook(() =>
      useGetGameEndingMessage(gdWith({ mode: 'compete', ending: { ...WON, by: 'u2', winner: 'u2' }, myOutcome: 'lost' })),
    )
    expect(result.current?.infoColText).toBe('moth won')
  })

  it('keeps its identity across a reload that rebuilds the ending object', () => {
    // The blob is rebuilt on every reload; the message must not be, or the
    // effect that shows it would retract and re-show the pill.
    const { result, rerender } = renderHook((gd: GGameData) => useGetGameEndingMessage(gd), {
      initialProps: gdWith({ ending: WON, myOutcome: 'won' }),
    })
    const first = result.current
    rerender(gdWith({ ending: { ...WON }, myOutcome: 'won' }))
    expect(result.current).toBe(first)
  })

  it('is a new message when the ending changes', () => {
    const { result, rerender } = renderHook((gd: GGameData) => useGetGameEndingMessage(gd), {
      initialProps: gdWith({ ending: WON, myOutcome: 'won' }),
    })
    const first = result.current
    rerender(gdWith({
      ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
      outcome: 'lost',
      myOutcome: 'lost',
    }))
    expect(result.current).not.toBe(first)
    expect(result.current?.pillText).toBe('Lost: out of time')
  })
})

