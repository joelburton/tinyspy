// cs-unmet

/**
 * The verdict mark and how it ends: a mark with a message leaves with its
 * pill, a mark without one stays, a new mark replaces the last, and `clear`
 * takes it off. Who raises it is useMarkForeignGuesses.test.ts's and
 * useSubmitGuess.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useVerdictMark } from './useVerdictMark'

const WRONG = FeedbackMessage.result('lost', 'Wrong')

function setup() {
  const slot = createFeedbackSlot('local')
  const hook = renderHook(() => useVerdictMark({ localFeedbackSlot: slot }))
  return { ...hook, slot }
}

describe('useVerdictMark', () => {
  it('starts with no mark', () => {
    expect(setup().result.current.mark).toBeNull()
  })

  it('colors the tiles in the outcome and shows the message', () => {
    const { result, slot } = setup()
    act(() => result.current.markTiles({ tiles: ['a', 'b', 'e', 'i'], outcome: 'lost', message: WRONG }))
    expect([...result.current.mark!.value.tiles]).toEqual(['a', 'b', 'e', 'i'])
    expect(result.current.mark!.value.outcome).toBe('lost')
    expect(slot.peek().map((e) => e.message.text)).toEqual(['Wrong'])
  })

  it('a mark with a message leaves with its pill', () => {
    const { result, slot } = setup()
    act(() => result.current.markTiles({ tiles: ['a'], outcome: 'lost', message: WRONG }))
    expect(result.current.mark).not.toBeNull()
    act(() => slot.dismiss())
    expect(result.current.mark).toBeNull()
  })

  it('a mark without a message shows nothing in the slot, and stays', () => {
    const { result, slot } = setup()
    act(() => result.current.markTiles({ tiles: ['c', 'd', 'f', 'g'], outcome: 'near', message: null }))
    expect(slot.peek()).toEqual([])
    act(() => slot.dismiss())
    expect(result.current.mark!.value.outcome).toBe('near')
  })

  it('a new mark replaces the last', () => {
    const { result } = setup()
    act(() => result.current.markTiles({ tiles: ['a'], outcome: 'lost', message: WRONG }))
    act(() => result.current.markTiles({ tiles: ['b'], outcome: 'near', message: null }))
    expect([...result.current.mark!.value.tiles]).toEqual(['b'])
  })

  it('clears on demand', () => {
    const { result } = setup()
    act(() => result.current.markTiles({ tiles: ['a'], outcome: 'lost', message: WRONG }))
    act(() => result.current.clear())
    expect(result.current.mark).toBeNull()
  })
})
