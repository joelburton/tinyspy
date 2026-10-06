// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { evaluatePlay } from '../lib/play'
import { makeGameData } from './useGame'
import { ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { useSubmitMove } from './useSubmitMove'

vi.mock('../db', () => ({ db: { rpc: vi.fn() } }))
const { db } = await import('../db')
const rpc = db.rpc as unknown as ReturnType<typeof vi.fn>

/** The RPC's envelope, as `runRpc` reads it. */
function answer(data: unknown) {
  return {
    data: {
      type: 'ok', data, outcome: null, severity: null, message: null, field: null,
      meta: null, dbcode: null, detail: null,
    },
    error: null,
  }
}

// CAT across the star, from the rack's first three slots.
const PLACEMENTS = [
  { x: 6, y: 7, letter: 'c', blank: false },
  { x: 7, y: 7, letter: 'a', blank: false },
  { x: 8, y: 7, letter: 't', blank: false },
]
const SLOTS = { removed: new Set([0, 1, 2]), oldLen: 7 }

function setup() {
  const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
  const slot = { show: vi.fn(() => '1') } as unknown as FeedbackSlot
  const view = renderHook(() => useSubmitMove({ gd, localFeedbackSlot: slot }))
  const play = evaluatePlay(gd.board.cells, PLACEMENTS)
  if (!play.valid) throw new Error('fixture play should be legal')
  return { view, play }
}

describe('useSubmitMove — the claim on my rack', () => {
  beforeEach(() => rpc.mockReset())

  it('a played word leaves its slots, and the count it drew, for the landing', async () => {
    rpc.mockResolvedValue(answer({ result: 'accepted', drawn: ['e', 'r'], version: 1, terminal: false }))
    const { view, play } = setup()
    await act(() => view.result.current.sendWord(PLACEMENTS, play, SLOTS))
    expect(view.result.current.takeMyMove()).toEqual({ slots: SLOTS, nDrawn: 2 })
    // Taken once: the next landing is not mine.
    expect(view.result.current.takeMyMove()).toBeNull()
  })

  it('a word the dictionary refused gives the claim back', async () => {
    rpc.mockResolvedValue(answer({ result: 'invalid', bad_words: ['cat'] }))
    const { view, play } = setup()
    let played = true
    await act(async () => { played = await view.result.current.sendWord(PLACEMENTS, play, SLOTS) })
    expect(played).toBe(false)
    expect(view.result.current.takeMyMove()).toBeNull()
    expect(view.result.current.refusedCells.size).toBe(3)
  })
})
