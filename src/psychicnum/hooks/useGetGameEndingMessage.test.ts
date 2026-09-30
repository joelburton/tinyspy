// cs-unmet

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GameEnding } from '@/common/terminal/gameEnding'
import type { GameData } from './useGame'
import { useGetGameEndingMessage } from './useGetGameEndingMessage'

/** Just what the hook reads: the mode, the ending, the winner and whether I
 *  solved. */
function gdWith(o: {
  mode?: 'coop' | 'compete'
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'> | null
  winnerName?: string
  hasSolved?: boolean
}): GameData {
  return {
    mode: o.mode ?? 'coop',
    gameEnding: o.gameEnding,
    winner: o.winnerName === undefined ? null : { username: o.winnerName },
    standing: { hasSolved: o.hasSolved ?? false },
  } as unknown as GameData
}

const WON: Pick<GameEnding, 'outcome' | 'reason'> = { outcome: 'won', reason: 'reached_goal' }

describe('useGetGameEndingMessage', () => {
  it('is null while the game is played', () => {
    const { result } = renderHook(() => useGetGameEndingMessage(gdWith({ gameEnding: null })))
    expect(result.current).toBeNull()
  })

  it('builds the message for the ending', () => {
    const { result } = renderHook(() =>
      useGetGameEndingMessage(gdWith({ gameEnding: WON, hasSolved: true })),
    )
    expect(result.current).toEqual({ pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' })
  })

  it('names compete\'s winner when it is not me', () => {
    const { result } = renderHook(() =>
      useGetGameEndingMessage(gdWith({ mode: 'compete', gameEnding: WON, winnerName: 'moth' })),
    )
    expect(result.current?.infoColText).toBe('moth won')
  })

  it('keeps its identity across a reload that rebuilds the ending object', () => {
    // The page rebuilds `gameEnding` on every reload; the message must not,
    // or the effect that shows it would retract and re-show the pill.
    const { result, rerender } = renderHook((gd: GameData) => useGetGameEndingMessage(gd), {
      initialProps: gdWith({ gameEnding: WON }),
    })
    const first = result.current
    rerender(gdWith({ gameEnding: { ...WON } }))
    expect(result.current).toBe(first)
  })

  it('is a new message when the ending changes', () => {
    const { result, rerender } = renderHook((gd: GameData) => useGetGameEndingMessage(gd), {
      initialProps: gdWith({ gameEnding: WON }),
    })
    const first = result.current
    rerender(gdWith({ gameEnding: { outcome: 'lost', reason: 'timeout' } }))
    expect(result.current).not.toBe(first)
    expect(result.current?.pillText).toBe('Lost: out of time')
  })
})
