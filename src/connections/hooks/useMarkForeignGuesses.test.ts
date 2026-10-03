// cs-unmet

/**
 * A teammate's row arriving marks their four tiles with no message; their
 * correct row clears instead; my own row does nothing; and a past turn on
 * screen marks nothing.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GEvent, GPlayer, GGuessResult } from '../types'
import { useMarkForeignGuesses } from './useMarkForeignGuesses'

const ME = { id: 'u1', username: 'me', color: 'red' } as GPlayer
const MOTH = { id: 'u2', username: 'moth', color: 'blue' } as GPlayer

function row(id: number, by: GPlayer, result: GGuessResult, tileIds: string[]): GEvent {
  const matched = result === 'correct'
  return {
    id, by, tiles: tileIds.map((id) => ({ id, word: id })), result, matched,
    outcome: matched ? 'won' : result === 'oneAway' ? 'near' : 'lost',
    matchedCatRank: matched ? 0 : null, at: 't',
  }
}

const MY_WRONG = row(1, ME, 'wrong', ['a', 'b', 'e', 'i'])
const THEIR_WRONG = row(2, MOTH, 'wrong', ['c', 'd', 'f', 'g'])
const THEIR_MATCH = row(3, MOTH, 'correct', ['a', 'b', 'c', 'd'])

/** Mount over a log, with a spy for the mark. */
function setup(guesses: GEvent[] = [], isViewingHistory = false) {
  const verdict = { markTiles: vi.fn(), clear: vi.fn() }
  const hook = renderHook(
    ({ guesses }: { guesses: GEvent[] }) =>
      useMarkForeignGuesses({ guesses, me: ME, isViewingHistory, verdict }),
    { initialProps: { guesses } },
  )
  return { ...hook, verdict }
}

describe('useMarkForeignGuesses', () => {
  it('marks nothing on mount, whatever the log holds', () => {
    const { verdict } = setup([THEIR_WRONG])
    expect(verdict.markTiles).not.toHaveBeenCalled()
    expect(verdict.clear).not.toHaveBeenCalled()
  })

  it('my own row arriving does nothing', () => {
    const { rerender, verdict } = setup()
    rerender({ guesses: [MY_WRONG] })
    expect(verdict.markTiles).not.toHaveBeenCalled()
    expect(verdict.clear).not.toHaveBeenCalled()
  })

  it('a teammate\'s wrong guess marks their four, with no message', () => {
    const { rerender, verdict } = setup()
    rerender({ guesses: [THEIR_WRONG] })
    expect(verdict.markTiles).toHaveBeenCalledWith({
      tileIds: ['c', 'd', 'f', 'g'], outcome: 'lost', message: null,
    })
  })

  it('a teammate\'s correct guess clears instead — the band says it', () => {
    const { rerender, verdict } = setup()
    rerender({ guesses: [THEIR_MATCH] })
    expect(verdict.markTiles).not.toHaveBeenCalled()
    expect(verdict.clear).toHaveBeenCalledTimes(1)
  })

  it('marks nothing for a row arriving while a past turn is open', () => {
    const { rerender, verdict } = setup([], true)
    rerender({ guesses: [THEIR_WRONG] })
    expect(verdict.markTiles).not.toHaveBeenCalled()
    expect(verdict.clear).toHaveBeenCalledTimes(1)
  })
})
