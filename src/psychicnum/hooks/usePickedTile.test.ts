// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createFeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { usePickedTile } from './usePickedTile'

type Props = { isStillPlaying: boolean; isViewingHistory: boolean }

function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const dismissed = vi.spyOn(slot, 'dismiss')
  const { result, rerender } = renderHook(
    (p: Props) => usePickedTile({ localFeedbackSlot: slot, ...p }),
    { initialProps: initial },
  )
  return { result, rerender, dismissed }
}

const PLAYING: Props = { isStillPlaying: true, isViewingHistory: false }

describe('usePickedTile', () => {
  it('a gesture picks the word and dismisses the slot\'s result', () => {
    const { result, dismissed } = setup(PLAYING)
    act(() => result.current.choosePickedTile('apple'))
    expect(result.current.pickedTile).toBe('apple')
    expect(dismissed).toHaveBeenCalledTimes(1)
  })

  it('clearing for a submit leaves the slot alone', () => {
    const { result, dismissed } = setup(PLAYING)
    act(() => result.current.choosePickedTile('apple'))
    act(() => result.current.clearPickedTile())
    expect(result.current.pickedTile).toBeNull()
    expect(dismissed).toHaveBeenCalledTimes(1)
  })

  it('draws no pick once I cannot play, or while a past turn is open', () => {
    const { result, rerender } = setup(PLAYING)
    act(() => result.current.choosePickedTile('apple'))
    expect(result.current.shownPickedTile).toBe('apple')
    rerender({ ...PLAYING, isStillPlaying: false })
    expect(result.current.shownPickedTile).toBeNull()
    rerender({ ...PLAYING, isViewingHistory: true })
    expect(result.current.shownPickedTile).toBeNull()
    // The pick itself is kept, for when the board is live again.
    rerender(PLAYING)
    expect(result.current.shownPickedTile).toBe('apple')
  })
})
