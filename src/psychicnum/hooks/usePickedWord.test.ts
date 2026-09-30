// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { usePickedWord } from './usePickedWord'

type Props = { isStillPlaying: boolean; isViewingHistory: boolean }

function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const dismissed = vi.spyOn(slot, 'dismiss')
  const { result, rerender } = renderHook(
    (p: Props) => usePickedWord({ localFeedbackSlot: slot, ...p }),
    { initialProps: initial },
  )
  return { result, rerender, dismissed }
}

const PLAYING: Props = { isStillPlaying: true, isViewingHistory: false }

describe('usePickedWord', () => {
  it('a gesture picks the word and dismisses the slot\'s result', () => {
    const { result, dismissed } = setup(PLAYING)
    act(() => result.current.choosePickedWord('apple'))
    expect(result.current.pickedWord).toBe('apple')
    expect(dismissed).toHaveBeenCalledTimes(1)
  })

  it('clearing for a submit leaves the slot alone', () => {
    const { result, dismissed } = setup(PLAYING)
    act(() => result.current.choosePickedWord('apple'))
    act(() => result.current.clearPickedWord())
    expect(result.current.pickedWord).toBeNull()
    expect(dismissed).toHaveBeenCalledTimes(1)
  })

  it('draws no pick once I cannot play, or while a past turn is open', () => {
    const { result, rerender } = setup(PLAYING)
    act(() => result.current.choosePickedWord('apple'))
    expect(result.current.shownPickedWord).toBe('apple')
    rerender({ ...PLAYING, isStillPlaying: false })
    expect(result.current.shownPickedWord).toBeNull()
    rerender({ ...PLAYING, isViewingHistory: true })
    expect(result.current.shownPickedWord).toBeNull()
    // The pick itself is kept, for when the board is live again.
    rerender(PLAYING)
    expect(result.current.shownPickedWord).toBe('apple')
  })
})
