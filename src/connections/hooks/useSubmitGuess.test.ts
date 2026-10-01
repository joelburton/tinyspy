// cs-unmet

/**
 * The round trip for one guess: the refusal made locally, the four verdicts
 * the server can record, what each shows and marks, and the picks cleared —
 * or left in place after a not-ok. What a verdict is worth is
 * lib/answer.test.ts's; the fill itself is useVerdictMark.test.ts's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { Board } from '../lib/board'
import type { EventRow, GameData } from './useGame'
import { useSubmitGuess } from './useSubmitGuess'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
import { db } from '../db'
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

const BOARD: Board = {
  categories: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

/** An `ok` envelope recording `result`, in the shape `runRpc` unwraps. */
function okAnswer(result: string) {
  return {
    data: {
      type: 'ok', data: { result }, outcome: null, severity: null,
      message: null, field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
  }
}

/** A race the server refused, in the shape `runRpc` unwraps. */
const RACE = {
  data: {
    type: 'not-ok', data: null, outcome: 'warning', severity: 'race',
    message: 'That category is already matched', field: '_', meta: null,
    dbcode: 'PN300', detail: null,
  },
  error: null,
}

/** Just what the hook reads: the picks, the log and the board. */
function gdWith(union: string[], boardEvents: EventRow[] = []) {
  const sendClear = vi.fn()
  const gd = {
    gameId: 'g1',
    picks: { union, sendClear },
    boardEvents,
    puzzle: { board: BOARD },
  } as unknown as GameData
  return { gd, sendClear }
}

function setup(union: string[], boardEvents: EventRow[] = []) {
  const { gd, sendClear } = gdWith(union, boardEvents)
  const slot = createFeedbackSlot('local')
  const showVerdictFor = vi.fn()
  const { result } = renderHook(() =>
    useSubmitGuess({ gd, localFeedbackSlot: slot, showVerdictFor }),
  )
  return { result, sendClear, slot, showVerdictFor }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('useSubmitGuess', () => {
  it('sends nothing short of four tiles', async () => {
    const { result } = setup(['a', 'b'])
    await act(() => result.current.submitGuess())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a set already tried locally, marks it, and clears the picks', async () => {
    const tried: EventRow = {
      id: 1, user_id: 'u1', tiles: ['i', 'e', 'b', 'a'], result: 'wrong', matched: false,
      outcome: 'lost', matched_category_rank: null, created_at: 't',
    }
    const { result, sendClear, showVerdictFor } = setup(['a', 'b', 'e', 'i'], [tried])
    await act(() => result.current.submitGuess())
    expect(rpc).not.toHaveBeenCalled()
    expect(showVerdictFor).toHaveBeenCalledWith(
      ['a', 'b', 'e', 'i'],
      expect.objectContaining({ text: 'You already tried that' }),
    )
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('works the verdict out itself and sends it up, with the matched rank', async () => {
    rpc.mockResolvedValue(okAnswer('correct'))
    const { result, sendClear, slot, showVerdictFor } = setup(['a', 'b', 'c', 'd'])
    await act(() => result.current.submitGuess())
    expect(rpc).toHaveBeenCalledWith('submit_guess', {
      p_game_id: 'g1', p_tiles: ['a', 'b', 'c', 'd'], p_result: 'correct', p_matched_category_rank: 0,
    })
    // A match shows its answer and collapses into a band: no fill to mark.
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Correct'])
    expect(showVerdictFor).not.toHaveBeenCalled()
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('sends a miss without a rank, and fills the four on the answer', async () => {
    rpc.mockResolvedValue(okAnswer('oneAway'))
    const { result, sendClear, showVerdictFor } = setup(['a', 'b', 'c', 'e'])
    await act(() => result.current.submitGuess())
    expect(rpc).toHaveBeenCalledWith('submit_guess', {
      p_game_id: 'g1', p_tiles: ['a', 'b', 'c', 'e'], p_result: 'oneAway',
    })
    expect(showVerdictFor).toHaveBeenCalledWith(
      ['a', 'b', 'c', 'e'],
      expect.objectContaining({ outcome: 'near' }),
    )
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('dims the four while the guess is out, and lifts the dim when the answer lands', async () => {
    let answer: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const { result } = setup(['a', 'b', 'e', 'i'])
    let done: Promise<void>
    act(() => { done = result.current.submitGuess() })
    expect([...result.current.inFlightTiles]).toEqual(['a', 'b', 'e', 'i'])
    await act(async () => {
      answer(okAnswer('wrong'))
      await done
    })
    expect(result.current.inFlightTiles.size).toBe(0)
  })

  it('leaves the picks in place after a not-ok, filled in the pill\'s outcome', async () => {
    rpc.mockResolvedValue(RACE)
    const { result, sendClear, showVerdictFor } = setup(['a', 'b', 'c', 'd'])
    await act(() => result.current.submitGuess())
    expect(showVerdictFor).toHaveBeenCalledWith(
      ['a', 'b', 'c', 'd'],
      expect.objectContaining({ outcome: 'warning' }),
    )
    expect(sendClear).not.toHaveBeenCalled()
  })
})
