// cs-unmet

/**
 * The round trip for one guess: the refusal made locally, the four verdicts
 * the server can record, what each shows and marks, and the picks cleared —
 * or left in place after a not-ok. What a verdict is worth is
 * lib/answer.test.ts's; the mark itself is useVerdictMark.test.ts's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ZTest_guess, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import type { GPicks } from '../types'
import { useSubmitGuess } from './useSubmitGuess'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
import { db } from '../db'
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

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

/** Mount over the picks `union`, on a game with these rows in its log. */
function setup(union: string[], events: ZTest_GameDataFacts['events'] = []) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ events }), 'u1')
  const sendClear = vi.fn()
  const picks = { union, sendClear } as unknown as GPicks
  const slot = createFeedbackSlot('local')
  const markTiles = vi.fn()
  const { result } = renderHook(() =>
    useSubmitGuess({ gd, picks, localFeedbackSlot: slot, markTiles }),
  )
  return { result, sendClear, slot, markTiles }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('useSubmitGuess', () => {
  it('sends nothing short of four tiles', async () => {
    const { result } = setup(['a', 'b'])
    await act(() => result.current.send())
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a set already tried locally, marks it, and clears the picks', async () => {
    const { result, sendClear, markTiles } = setup(
      ['a', 'b', 'e', 'i'],
      [ZTest_guess('u1', ['i', 'e', 'b', 'a'], 'wrong')],
    )
    await act(() => result.current.send())
    expect(rpc).not.toHaveBeenCalled()
    expect(markTiles).toHaveBeenCalledWith({
      tiles: ['a', 'b', 'e', 'i'],
      outcome: 'warning',
      message: expect.objectContaining({ text: 'You already tried that' }),
    })
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('works the verdict out itself and sends it up, with the matched rank', async () => {
    rpc.mockResolvedValue(okAnswer('correct'))
    const { result, sendClear, slot, markTiles } = setup(['a', 'b', 'c', 'd'])
    await act(() => result.current.send())
    expect(rpc).toHaveBeenCalledWith('submit_guess', {
      p_game_id: 'g1', p_tiles: ['a', 'b', 'c', 'd'], p_result: 'correct', p_matched_cat_rank: 0,
    })
    // A match shows its answer and collapses into a band: no fill to mark.
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Correct'])
    expect(markTiles).not.toHaveBeenCalled()
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('sends a miss without a rank, and fills the four on the answer', async () => {
    rpc.mockResolvedValue(okAnswer('oneAway'))
    const { result, sendClear, markTiles } = setup(['a', 'b', 'c', 'e'])
    await act(() => result.current.send())
    expect(rpc).toHaveBeenCalledWith('submit_guess', {
      p_game_id: 'g1', p_tiles: ['a', 'b', 'c', 'e'], p_result: 'oneAway',
    })
    expect(markTiles).toHaveBeenCalledWith({
      tiles: ['a', 'b', 'c', 'e'],
      outcome: 'near',
      message: expect.objectContaining({ outcome: 'near' }),
    })
    expect(sendClear).toHaveBeenCalledTimes(1)
  })

  it('dims the four while the guess is out, and lifts the dim when the answer lands', async () => {
    let answer: (v: unknown) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const { result } = setup(['a', 'b', 'e', 'i'])
    let done: Promise<void>
    act(() => { done = result.current.send() })
    expect([...result.current.inFlight]).toEqual(['a', 'b', 'e', 'i'])
    await act(async () => {
      answer(okAnswer('wrong'))
      await done
    })
    expect(result.current.inFlight.size).toBe(0)
  })

  it('leaves the picks in place after a not-ok, shows its sentence, and marks nothing', async () => {
    rpc.mockResolvedValue(RACE)
    const { result, sendClear, slot, markTiles } = setup(['a', 'b', 'c', 'd'])
    await act(() => result.current.send())
    expect(slot.peek().map((e) => e.message.text)).toEqual(['That category is already matched'])
    expect(markTiles).not.toHaveBeenCalled()
    expect(sendClear).not.toHaveBeenCalled()
  })
})
