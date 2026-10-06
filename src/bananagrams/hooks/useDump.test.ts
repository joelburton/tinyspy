// cs-unmet

/**
 * A dump's round trip: a dump that lands says nothing (the log's row is
 * useShowDrawMessages'), and a refusal shows the server's sentence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useDump } from './useDump'

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
    message: 'Bunch too low to dump', field: '_', meta: null, dbcode: 'PN347', detail: null,
  },
  error: null,
}

function setup() {
  const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
  const slot = createFeedbackSlot('local')
  const { result } = renderHook(() => useDump({ gd, localFeedbackSlot: slot }))
  return { gd, result, slot }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('useDump', () => {
  it('sends the game and the tile, and says nothing when it lands', async () => {
    rpc.mockResolvedValue(okAnswer({ result: 'dumped' }))
    const { gd, result, slot } = setup()
    await act(() => result.current.dump('q'))
    expect(rpc).toHaveBeenCalledWith('dump', { p_game_id: gd.id, p_tile: 'q' })
    expect(slot.peek()).toEqual([])
  })

  it('a refusal shows the server\'s sentence', async () => {
    rpc.mockResolvedValue(RACE)
    const { result, slot } = setup()
    await act(() => result.current.dump('q'))
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Bunch too low to dump'])
  })
})
