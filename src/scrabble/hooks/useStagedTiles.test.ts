// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { decodeBoard } from '../lib/board'
import type { GHistoryView } from '../types'
import { useStagedTiles } from './useStagedTiles'

const RACK = ['c', 'a', 't', 's', 'e', 'r', '?']
const EMPTY = '.'.repeat(225)

/** The board with one tile laid at (x, y). */
function makeBoardWith(x: number, y: number, ch: string) {
  const i = y * 15 + x
  return decodeBoard(EMPTY.slice(0, i) + ch + EMPTY.slice(i + 1))
}

function setup() {
  const slot = { show: vi.fn(() => '1'), dismiss: vi.fn() } as unknown as FeedbackSlot
  const historyView = { exit: vi.fn() } as unknown as GHistoryView
  const view = renderHook(() => useStagedTiles({
    cells: decodeBoard(EMPTY),
    rack: RACK,
    historyView,
    localFeedbackSlot: slot,
    registerSuggestionApplier: () => {},
  }))
  return { view, slot }
}

describe('useStagedTiles — an opponent\'s move landing', () => {
  it('keeps my staged tiles when the move missed their cells', () => {
    const { view, slot } = setup()
    act(() => view.result.current.placeFromRack(7, 7, 0))
    act(() => view.result.current.dropIfCovered(makeBoardWith(3, 3, 'q')))
    expect(view.result.current.tiles).toHaveLength(1)
    expect(slot.show).not.toHaveBeenCalled()
  })

  it('clears them, and says so, when the move took one of their cells', () => {
    const { view, slot } = setup()
    act(() => view.result.current.placeFromRack(7, 7, 0))
    act(() => view.result.current.dropIfCovered(makeBoardWith(7, 7, 'q')))
    expect(view.result.current.tiles).toEqual([])
    expect(slot.show).toHaveBeenCalledTimes(1)
  })
})

describe('useStagedTiles — a typed letter', () => {
  it('takes the letter\'s own tile, else a blank, else refuses', () => {
    const { view } = setup()
    let placed = false
    act(() => { placed = view.result.current.placeLetter(7, 7, 'a') })
    expect(placed).toBe(true)
    act(() => { placed = view.result.current.placeLetter(8, 7, 'q') })
    expect(placed).toBe(true)
    act(() => { placed = view.result.current.placeLetter(9, 7, 'z') })
    expect(placed).toBe(false)
    expect(view.result.current.tiles).toEqual([
      { x: 7, y: 7, letter: 'a', blank: false, rackIdx: 1 },
      { x: 8, y: 7, letter: 'q', blank: true, rackIdx: 6 },
    ])
  })
})
