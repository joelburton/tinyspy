// cs-audited-feedback

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useFeedbackSlot, useTopFeedbackMessage } from './useFeedbackSlot'
import { FeedbackMessage } from './FeedbackMessage'
import { peekFeedbackSlotForTest } from './feedbackSlotRegistry'

/**
 * What the hook adds to the store: one slot per host with a STABLE identity
 * (so it can sit in a dependency array), registration under its name while
 * mounted, and teardown on unmount. The list rules themselves are the
 * store's and are tested there.
 */

const moth = { username: 'moth', color: 'green' }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useFeedbackSlot', () => {
  it('returns the same slot across renders', () => {
    const { result, rerender } = renderHook(() => useFeedbackSlot('local'))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('registers the slot under its name while mounted, and drops it on unmount', () => {
    const { result, unmount } = renderHook(() => useFeedbackSlot('local'))
    act(() => void result.current.show(FeedbackMessage.note('here')))
    expect(peekFeedbackSlotForTest('local').map((e) => e.message.text)).toEqual(['here'])
    unmount()
    expect(peekFeedbackSlotForTest('local')).toEqual([])
  })

  it('clears a pending timer on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderHook(() => useFeedbackSlot('global'))
    act(() => void result.current.show(FeedbackMessage.peer(moth, 'won', 'found APPLE')))
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('useTopFeedbackMessage', () => {
  it('re-renders with the top message as it changes', () => {
    const { result } = renderHook(() => {
      const slot = useFeedbackSlot('local')
      return { slot, top: useTopFeedbackMessage(slot) }
    })
    expect(result.current.top).toBeNull()
    act(() => void result.current.slot.show(FeedbackMessage.result('lost', 'Not a word')))
    expect(result.current.top?.text).toBe('Not a word')
    act(() => result.current.slot.dismiss())
    expect(result.current.top).toBeNull()
  })

  it('a condition as an effect: shown on the rising edge, retracted by the cleanup', () => {
    const { result, rerender } = renderHook(
      ({ waiting }: { waiting: boolean }) => {
        const slot = useFeedbackSlot('local')
        const top = useTopFeedbackMessage(slot)
        // The shape every converted game writes: an effect keyed on a
        // primitive, whose cleanup retracts.
        useEffect(
          function announceWaiting() {
            if (!waiting) return
            const id = slot.show(FeedbackMessage.waiting(moth))
            return () => slot.retract(id)
          },
          [slot, waiting],
        )
        return top
      },
      { initialProps: { waiting: false } },
    )
    expect(result.current).toBeNull()
    rerender({ waiting: true })
    expect(result.current?.kind).toBe('waiting')
    rerender({ waiting: false })
    expect(result.current).toBeNull()
  })
})
