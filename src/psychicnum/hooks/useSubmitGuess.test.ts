// cs-unmet

/**
 * Sending a guess, without mounting a board: the refusal the board makes
 * itself, the answer shown for each server reply, and how long a tile counts
 * as in flight.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useSubmitGuess } from './useSubmitGuess'
import type { GTile } from '../types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../db', () => ({ db: { rpc } }))

function okEnvelope(data: unknown) {
  return { data: { type: 'ok', data, outcome: null, severity: null, message: null }, error: null }
}

/** One tile, guessed or not, and the board that holds it alone. */
const tile = (word: string, correct: boolean | null): GTile =>
  ({ id: word, word, correct, outcome: correct === null ? null : correct ? 'won' : 'lost', decidedBy: null })
const boardOf = (t: GTile): ReadonlyMap<string, GTile> => new Map([[t.id, t]])

type Props = { tilesById: ReadonlyMap<string, GTile>; isViewingHistory: boolean }

function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const { result, rerender } = renderHook(
    (p: Props) => useSubmitGuess({ gameId: 'g1', localFeedbackSlot: slot, ...p }),
    { initialProps: initial },
  )
  return { result, rerender, shown }
}

const APPLE = tile('apple', null)
const APPLE_MISSED = tile('apple', false)
const LIVE: Props = { tilesById: boardOf(APPLE), isViewingHistory: false }

beforeEach(() => rpc.mockReset())

describe('useSubmitGuess', () => {
  it('refuses a tile already decided without calling the server', async () => {
    const { result, shown } = setup({ ...LIVE, tilesById: boardOf(APPLE_MISSED) })
    await act(() => result.current.send(APPLE_MISSED))
    expect(rpc).not.toHaveBeenCalled()
    expect(shown.mock.calls[0][0].text).toBe('Already guessed')
  })

  it("sends the tile's word and shows its answer", async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'hit', found_all: false }))
    const { result, shown } = setup(LIVE)
    await act(() => result.current.send(APPLE))
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'apple' })
    expect(shown.mock.calls[0][0].text).toBe('Correct: APPLE')
  })

  it('keeps the tile in flight until the live board decides it', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'miss', found_all: false }))
    const { result, rerender } = setup(LIVE)
    await act(() => result.current.send(APPLE))
    // The reply is in; the colored tile is not yet.
    expect(result.current.inFlightTile).toBe(APPLE)
    rerender({ ...LIVE, tilesById: boardOf(APPLE_MISSED) })
    expect(result.current.inFlightTile).toBeNull()
  })

  it('shows nothing in flight while a past turn is open', async () => {
    rpc.mockResolvedValue(okEnvelope({ result: 'miss', found_all: false }))
    const { result, rerender } = setup(LIVE)
    await act(() => result.current.send(APPLE))
    rerender({ ...LIVE, isViewingHistory: true })
    expect(result.current.inFlightTile).toBeNull()
  })
})
