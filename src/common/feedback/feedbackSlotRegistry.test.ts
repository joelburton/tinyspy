// cs-blessed-feedback

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFeedbackSlot } from './feedbackSlotStore'
import { peekFeedbackSlotForTest, registerFeedbackSlot } from './feedbackSlotRegistry'
import { FeedbackMessage } from './FeedbackMessage'

/**
 * The registry knows which slot is mounted under each name, and nothing
 * else: `peek` reads the live one, `puppill` shows into it, and an
 * unregister for a slot that has since been replaced leaves the newcomer
 * alone.
 */

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('feedbackSlotRegistry', () => {
  it('peek reads the mounted slot, and [] when none is', () => {
    expect(peekFeedbackSlotForTest('local')).toEqual([])
    const slot = createFeedbackSlot('local')
    cleanups.push(registerFeedbackSlot(slot))
    slot.show(FeedbackMessage.note('here'))
    expect(peekFeedbackSlotForTest('local').map((e) => e.message.text)).toEqual(['here'])
  })

  it('an unregister for a superseded slot does not drop the newcomer', () => {
    const old = createFeedbackSlot('local')
    const unregisterOld = registerFeedbackSlot(old)
    const fresh = createFeedbackSlot('local')
    cleanups.push(registerFeedbackSlot(fresh))
    unregisterOld()
    fresh.show(FeedbackMessage.note('fresh'))
    expect(peekFeedbackSlotForTest('local').map((e) => e.message.text)).toEqual(['fresh'])
  })

  it('puppill shows into the named slot and returns the id', () => {
    const slot = createFeedbackSlot('global')
    cleanups.push(registerFeedbackSlot(slot))
    const id = window.puppill!('hey', 'peer', 'global')
    expect(id).toBeTypeOf('string')
    expect(slot.getTop()?.kind).toBe('peer')
    window.pupretract!(id!, 'global')
    expect(slot.getTop()).toBeNull()
  })

  it('puppill warns and shows nothing when no such slot is mounted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(window.puppill!('hey', 'result', 'local')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
