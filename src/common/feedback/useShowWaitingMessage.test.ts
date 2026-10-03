// cs-unmet

import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Player } from '../members/member'
import { createFeedbackSlot } from './feedbackSlotStore'
import { useShowWaitingMessage } from './useShowWaitingMessage'

type Props = { isWaiting: boolean; holder: Player | null }

/** Mount the hook over a real local slot, with spies on what it shows and
 *  takes back. */
function setup(initial: Props) {
  const slot = createFeedbackSlot('local')
  const shown = vi.spyOn(slot, 'show')
  const retracted = vi.spyOn(slot, 'retract')
  const { rerender, unmount } = renderHook(
    (p: Props) => useShowWaitingMessage({ slot, isWaiting: p.isWaiting, holder: p.holder }),
    { initialProps: initial },
  )
  return { shown, retracted, rerender, unmount }
}

const MOTH: Player = { id: 'moth', username: 'moth', color: 'blue' }

describe('useShowWaitingMessage', () => {
  it('shows nothing while the move is mine', () => {
    const { shown } = setup({ isWaiting: false, holder: MOTH })
    expect(shown).not.toHaveBeenCalled()
  })

  it('shows the waiting message while someone else holds the move', () => {
    const { shown } = setup({ isWaiting: true, holder: MOTH })
    expect(shown).toHaveBeenCalledTimes(1)
  })

  it('retracts it when the wait ends', () => {
    const { rerender, retracted } = setup({ isWaiting: true, holder: MOTH })
    rerender({ isWaiting: false, holder: MOTH })
    expect(retracted).toHaveBeenCalledTimes(1)
  })

  it('leaves it alone when the holder is a fresh object with the same name and color', () => {
    // A game rebuilds its players on every reload; the same holder must not
    // retract and re-show the message.
    const { rerender, shown, retracted } = setup({ isWaiting: true, holder: MOTH })
    rerender({ isWaiting: true, holder: { ...MOTH } })
    expect(shown).toHaveBeenCalledTimes(1)
    expect(retracted).not.toHaveBeenCalled()
  })

  it('shows it again for a new holder', () => {
    const { rerender, shown } = setup({ isWaiting: true, holder: MOTH })
    rerender({ isWaiting: true, holder: { id: 'bea', username: 'bea', color: 'green' } })
    expect(shown).toHaveBeenCalledTimes(2)
  })

  it('retracts it on unmount', () => {
    const { unmount, retracted } = setup({ isWaiting: true, holder: MOTH })
    unmount()
    expect(retracted).toHaveBeenCalledTimes(1)
  })
})
