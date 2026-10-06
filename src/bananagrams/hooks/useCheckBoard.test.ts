// cs-unmet

/**
 * Check words' round trip: what each of `check_board`'s answers shows in the
 * local slot and hands back to the editing board — the failing cells, none
 * for a clean or an empty board, or null when the check itself failed. What an
 * answer reads as is lib/answer.test.ts's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { answerMessage } from '../lib/answer'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import type { GAnswer } from '../types'
import { makeGameData } from './useGame'
import { useCheckBoard } from './useCheckBoard'

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

/** A fault the server raised, in the shape `runRpc` unwraps. */
const FAULT = {
  data: {
    type: 'not-ok', data: null, outcome: 'lost', severity: 'fault',
    message: 'BUG: a board check for a player with no board', field: '_', meta: null,
    dbcode: 'PN337', detail: null,
  },
  error: null,
}

function setup() {
  const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
  const slot = createFeedbackSlot('local')
  const { result } = renderHook(() => useCheckBoard({ gd, localFeedbackSlot: slot }))
  return { gd, result, slot }
}

/** What the slot shows, as [outcome, text] pairs. */
const shown = (slot: ReturnType<typeof createFeedbackSlot>) =>
  slot.peek().map((e) => [e.message.outcome, e.message.text])

/** The pair `answerMessage` gives for an answer. */
const pair = (answer: GAnswer) => {
  const { outcome, text } = answerMessage(answer)
  return [outcome, text]
}

beforeEach(() => {
  rpc.mockReset()
})

describe('useCheckBoard', () => {
  it('a board that fails hands back its cells and counts them', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'invalid', invalid_cells: [1, 2, 3] }))
    const { gd, result, slot } = setup()
    const back = await act(() => result.current.checkBoard())
    expect(rpc).toHaveBeenCalledWith('check_board', { p_game_id: gd.id })
    expect(back).toEqual({ invalidCells: [1, 2, 3] })
    expect(shown(slot)).toEqual([pair({ answerType: 'check_invalid', nTiles: 3 })])
  })

  it('a clean board hands back no cells, so the red ones clear', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'clean' }))
    const { result, slot } = setup()
    expect(await act(() => result.current.checkBoard())).toEqual({ invalidCells: [] })
    expect(shown(slot)).toEqual([pair({ answerType: 'check_clean' })])
  })

  it('an empty board is its own answer, not a clean one', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'empty' }))
    const { result, slot } = setup()
    expect(await act(() => result.current.checkBoard())).toEqual({ invalidCells: [] })
    expect(shown(slot)).toEqual([pair({ answerType: 'check_empty' })])
  })

  it('a check that failed says so and leaves the marks alone', async () => {
    rpc.mockResolvedValue(FAULT)
    const { result, slot } = setup()
    expect(await act(() => result.current.checkBoard())).toBeNull()
    expect(slot.peek().map((e) => e.message.text)).toContain(
      'Check failed: BUG: a board check for a player with no board',
    )
  })
})
