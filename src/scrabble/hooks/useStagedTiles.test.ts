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

describe('useStagedTiles — a tap on a cell with tiles picked', () => {
  it('one picked tile goes onto an empty cell, and the pick drops', () => {
    const { view } = setup()
    act(() => view.result.current.togglePick(2))
    let answer = ''
    act(() => { answer = view.result.current.placePickedAt(7, 7) })
    expect(answer).toBe('placed')
    expect(view.result.current.tiles).toEqual([{ x: 7, y: 7, letter: 't', blank: false, rackIdx: 2 }])
    expect(view.result.current.pickedSlots.size).toBe(0)
  })

  it('a picked blank asks for its letter first', () => {
    const { view } = setup()
    act(() => view.result.current.togglePick(6))
    act(() => { view.result.current.placePickedAt(7, 7) })
    expect(view.result.current.blankAt).toEqual({ x: 7, y: 7, rackIdx: 6 })
    expect(view.result.current.tiles).toEqual([])
  })

  it('two picked tiles place nothing, and keep their picks', () => {
    const { view } = setup()
    act(() => view.result.current.togglePick(0))
    act(() => view.result.current.togglePick(1))
    let answer = ''
    act(() => { answer = view.result.current.placePickedAt(7, 7) })
    expect(answer).toBe('several')
    expect(view.result.current.tiles).toEqual([])
    expect(view.result.current.pickedSlots.size).toBe(2)
  })

  it('nothing picked, or a cell already holding a tile, leaves the tap to the cursor', () => {
    const { view } = setup()
    let answer = ''
    act(() => { answer = view.result.current.placePickedAt(7, 7) })
    expect(answer).toBe('none')
    act(() => view.result.current.placeFromRack(7, 7, 0))
    act(() => view.result.current.togglePick(1))
    act(() => { answer = view.result.current.placePickedAt(7, 7) })
    expect(answer).toBe('none')
    expect(view.result.current.pickedSlots.size).toBe(1)
  })
})
