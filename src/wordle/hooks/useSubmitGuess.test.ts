// cs-unmet

/**
 * Sending a guess: what each answer does to the word still out, the refusal
 * mark and the local slot. The words themselves are lib/answer.test.ts's.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { BoardRow } from '../lib/board'
import { db } from '../db'
import { useSubmitGuess } from './useSubmitGuess'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** The envelope `runRpc` unwraps, answering with this `data`. */
function answer(data: unknown) {
  return {
    data: {
      type: 'ok', data, outcome: null, severity: null,
      message: null, field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
  }
}

function setup(liveRows: BoardRow[] = []) {
  const localFeedbackSlot = createFeedbackSlot('local')
  const shown = vi.spyOn(localFeedbackSlot, 'show')
  const hook = renderHook(
    ({ rows }) => useSubmitGuess({ gameId: 'g1', liveRows: rows, localFeedbackSlot }),
    { initialProps: { rows: liveRows } },
  )
  return { ...hook, shown }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('useSubmitGuess', () => {
  it('refuses a short word without a call', async () => {
    const { result, shown } = setup()
    let isAccepted = true
    await act(async () => {
      isAccepted = await result.current.submitGuess('cra')
    })
    expect(isAccepted).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('keeps an accepted word on the board until its colored row lands', async () => {
    rpc.mockResolvedValue(answer({
      result: 'incorrect', colors: 'xxgyx', guesses_used: 1, solved: false, game_ended: false,
    }))
    const { result, rerender } = setup()
    let isAccepted = false
    await act(async () => {
      isAccepted = await result.current.submitGuess('slate')
    })
    expect(isAccepted).toBe(true)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'slate' })
    // The reply is in, but the row is not: the word stays.
    expect(result.current.inFlightWord).toBe('slate')

    rerender({ rows: [{ guess: 'slate', colors: 'xxgyx' }] })
    expect(result.current.inFlightWord).toBeNull()
  })

  it('takes a soft-rejected word back and rings the row in the answer\'s own outcome', async () => {
    rpc.mockResolvedValue(answer({
      result: 'duplicate', guesses_used: 1, solved: false, game_ended: false,
    }))
    const { result, shown } = setup()
    let isAccepted = true
    await act(async () => {
      isAccepted = await result.current.submitGuess('slate')
    })
    expect(isAccepted).toBe(false)
    expect(result.current.inFlightWord).toBeNull()
    // `duplicate` is a warning (lib/answer.ts), not the loss a default would say.
    expect(result.current.refusedGuessMark?.value).toBe('warning')
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('rings a refusal in the envelope\'s own outcome', async () => {
    rpc.mockResolvedValue({
      data: {
        type: 'not-ok', data: null, outcome: 'lost', severity: 'race',
        message: 'Not your turn.', field: null, meta: null, dbcode: 'PN999', detail: null,
      },
      error: null,
    })
    const { result, shown } = setup()
    let isAccepted = true
    await act(async () => {
      isAccepted = await result.current.submitGuess('slate')
    })
    expect(isAccepted).toBe(false)
    expect(result.current.inFlightWord).toBeNull()
    expect(result.current.refusedGuessMark?.value).toBe('lost')
    expect(shown).toHaveBeenCalledTimes(1)
  })
})
