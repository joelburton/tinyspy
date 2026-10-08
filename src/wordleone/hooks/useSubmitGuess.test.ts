// cs-unmet

/**
 * Sending a guess: what each answer does to the word still out, the refusal
 * mark, the typed row and the local slot. The words themselves are
 * lib/answer.test.ts's.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { db } from '../db'
import type { GBoardRow } from '../types'
import { useSubmitGuess } from './useSubmitGuess'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

const STARTER: GBoardRow = { word: 'sieve', colors: 'yxyyg' }

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

function setup(liveRows: GBoardRow[] = [STARTER]) {
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

afterEach(() => {
  vi.useRealTimers()
})

describe('useSubmitGuess', () => {
  it('refuses a short word without a call', async () => {
    const { result, shown } = setup()
    let isCleared = true
    await act(async () => {
      isCleared = await result.current.send('cra', vi.fn())
    })
    expect(isCleared).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('keeps the solving word on the board until its green row lands', async () => {
    rpc.mockResolvedValue(answer({ result: 'correct', n_misses: 0, solved: true, game_ended: true }))
    const { result, rerender } = setup()
    let isCleared = false
    await act(async () => {
      isCleared = await result.current.send('verse', vi.fn())
    })
    expect(isCleared).toBe(true)
    expect(rpc).toHaveBeenCalledWith('submit_guess', { p_game_id: 'g1', p_guess: 'verse' })
    // The reply is in, but the row is not: the word stays.
    expect(result.current.inFlight).toBe('verse')

    rerender({ rows: [STARTER, { word: 'verse', colors: 'ggggg' }] })
    expect(result.current.inFlight).toBeNull()
  })

  it('a miss shakes red, says so, and clears the typed row when the shake ends', async () => {
    vi.useFakeTimers()
    rpc.mockResolvedValue(answer({ result: 'miss', n_misses: 1, solved: false, game_ended: false }))
    const { result, shown } = setup()
    const clearTypedWord = vi.fn()
    let isCleared = true
    await act(async () => {
      isCleared = await result.current.send('crane', clearTypedWord)
    })
    // No row will land for it: nothing is out, and the row is not cleared yet.
    expect(isCleared).toBe(false)
    expect(result.current.inFlight).toBeNull()
    expect(result.current.refusedMark?.value).toBe('lost')
    expect(shown).toHaveBeenCalledTimes(1)
    expect(clearTypedWord).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(WORD_ANSWER_MS)
    })
    expect(clearTypedWord).toHaveBeenCalledTimes(1)
    expect(result.current.refusedMark).toBeNull()
  })

  it.each([
    // Both refusals are `warning`, not the `lost` a default would say; the
    // miss above is the red one.
    ['duplicate', 'warning'],
    ['notAWord', 'warning'],
  ])('a %s rings in its own outcome, then clears the typed row when the shake ends', async (resultName, outcome) => {
    vi.useFakeTimers()
    rpc.mockResolvedValue(answer({ result: resultName, n_misses: 0, solved: false, game_ended: false }))
    const { result, shown } = setup()
    const clearTypedWord = vi.fn()
    let isCleared = true
    await act(async () => {
      isCleared = await result.current.send('zzzzz', clearTypedWord)
    })
    expect(isCleared).toBe(false)
    expect(result.current.inFlight).toBeNull()
    expect(result.current.refusedMark?.value).toBe(outcome)
    expect(shown).toHaveBeenCalledTimes(1)
    expect(clearTypedWord).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(WORD_ANSWER_MS)
    })
    expect(clearTypedWord).toHaveBeenCalledTimes(1)
  })

  it('rings a refusal in the envelope\'s own outcome, and leaves the word it never judged', async () => {
    vi.useFakeTimers()
    rpc.mockResolvedValue({
      data: {
        type: 'not-ok', data: null, outcome: 'lost', severity: 'race',
        message: 'Not your turn.', field: null, meta: null, dbcode: 'PN999', detail: null,
      },
      error: null,
    })
    const { result, shown } = setup()
    const clearTypedWord = vi.fn()
    let isCleared = true
    await act(async () => {
      isCleared = await result.current.send('slate', clearTypedWord)
    })
    expect(isCleared).toBe(false)
    expect(result.current.inFlight).toBeNull()
    expect(result.current.refusedMark?.value).toBe('lost')
    expect(shown).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(WORD_ANSWER_MS)
    })
    expect(clearTypedWord).not.toHaveBeenCalled()
  })
})
