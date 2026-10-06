// cs-unmet

/**
 * A peel's round trip: what each of `peel`'s answers shows in the local slot
 * and hands back to the editing board. What an answer reads as is
 * lib/answer.test.ts's; painting the cells is useEditingBoard.test.ts's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { answerMessage } from '../lib/answer'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { usePeel } from './usePeel'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
import { db } from '../db'
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** An `ok` envelope carrying `data`, in the shape `runRpc` unwraps. */
function okAnswer(data: object) {
  return {
    data: {
      type: 'ok', data, outcome: null, severity: null,
      message: null, field: null, meta: null, dbcode: null, detail: null,
    },
    error: null,
  }
}

/** A race the server refused, in the shape `runRpc` unwraps. */
const RACE = {
  data: {
    type: 'not-ok', data: null, outcome: 'warning', severity: 'race',
    message: 'Game over', field: '_', meta: null, dbcode: 'PN486', detail: null,
  },
  error: null,
}

function setup() {
  const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
  const slot = createFeedbackSlot('local')
  const { result } = renderHook(() => usePeel({ gd, localFeedbackSlot: slot }))
  return { gd, result, slot }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('usePeel', () => {
  it('sends the game, and says nothing for a dealt peel', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'dealt' }))
    const { gd, result, slot } = setup()
    const back = await act(() => result.current.peel())
    expect(rpc).toHaveBeenCalledWith('peel', { p_game_id: gd.id })
    expect(back).toBeNull()
    expect(slot.peek()).toEqual([])
  })

  it('says nothing for a winning peel: the ending says it', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'won' }))
    const { result, slot } = setup()
    expect(await act(() => result.current.peel())).toBeNull()
    expect(slot.peek()).toEqual([])
  })

  it('a blocked peel says so and hands back its cells', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'invalid', invalid_cells: [3, 4] }))
    const { result, slot } = setup()
    const back = await act(() => result.current.peel())
    expect(back).toEqual({ invalidCells: [3, 4] })
    const { outcome, text } = answerMessage({ answerType: 'peel_invalid' })
    expect(slot.peek().map((e) => [e.message.outcome, e.message.text])).toEqual([[outcome, text]])
  })

  it('a refusal shows the server\'s sentence and paints nothing', async () => {
    rpc.mockResolvedValue(RACE)
    const { result, slot } = setup()
    expect(await act(() => result.current.peel())).toBeNull()
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Game over'])
  })
})
