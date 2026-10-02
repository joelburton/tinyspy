// cs-unmet

/**
 * Sending a guess, without mounting a board: the refusal the board makes
 * itself, the answer shown for each server reply, and how long a word counts
 * as in flight.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TileResults } from '../lib/tileResults'
import { useSubmitGuess } from './useSubmitGuess'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../db', () => ({ db: { rpc } }))

function okEnvelope(data: unknown) {
  return { data: { type: 'ok', data, outcome: null, severity: null, message: null }, error: null }
}

type Props = { tileResults: TileResults; isViewingHistory: boolean }

function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const { result, rerender } = renderHook(
    (p: Props) => useSubmitGuess({ gameId: 'g1', localFeedbackSlot: slot, ...p }),
    { initialProps: initial },
  )
  return { result, rerender, shown }
}

const LIVE: Props = { tileResults: new Map(), isViewingHistory: false }

beforeEach(() => rpc.mockReset())

describe('useSubmitGuess', () => {
  it('refuses a word already on the board without calling the server', async () => {
    const { result, shown } = setup({ ...LIVE, tileResults: new Map([['apple', false]]) })
    await act(() => result.current.send('apple'))
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0][0].text).toBe('Already guessed')
  })

  it('sends the guess and shows its answer', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'hit', found_all: false }))
    const { result, shown } = setup(LIVE)
    await act(() => result.current.send('apple'))
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'apple' })
    expect(shown.mock.calls[0][0].text).toBe('Correct: APPLE')
  })

  it('keeps the word in flight until its result is on the board', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'miss', found_all: false }))
    const { result, rerender } = setup(LIVE)
    await act(() => result.current.send('apple'))
    // The reply is in; the colored tile is not yet.
    expect(result.current.inFlight).toBe('apple')
    rerender({ ...LIVE, tileResults: new Map([['apple', false]]) })
    expect(result.current.inFlight).toBeNull()
  })

  it('shows nothing in flight while a past turn is open', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'miss', found_all: false }))
    const { result, rerender } = setup(LIVE)
    await act(() => result.current.send('apple'))
    rerender({ ...LIVE, isViewingHistory: true })
    expect(result.current.inFlight).toBeNull()
  })
})
