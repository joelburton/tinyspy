// cs-blessed-feedback

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createFeedbackSlot, type FeedbackSlot, type SlotName } from './feedbackSlotStore'
import { registerFeedbackSlot } from './feedbackSlotRegistry'
import type { FeedbackMessage } from './FeedbackMessage'

export type { FeedbackSlot, SlotName } from './feedbackSlotStore'

/**
 * Make a feedback slot and own it for the life of this component.
 *
 * A PlayArea calls `useFeedbackSlot('local')` for the slot under its board;
 * a page calls `useFeedbackSlot('global')` for the one in its header and
 * hands it down as `ctx.globalFeedbackSlot`. The slot is created once and
 * keeps the same identity across renders, so it is safe in a dependency
 * array — which is what lets a condition be an effect:
 *
 *     useEffect(function showWaiting() {
 *       if (!waiting) return
 *       const id = localFeedbackSlot.show(FeedbackMessage.waiting(who))
 *       return () => localFeedbackSlot.retract(id)
 *     }, [localFeedbackSlot, waiting, who])
 *
 * On unmount every pending timer is cleared and the slot is unregistered
 * from the console's registry. To draw it, `<FeedbackPill slot={…} />`; to
 * read what it draws, `useWatchAndGetTopFeedbackMsg(slot)`; to re-render
 * when it changes and nothing more, `useWatchFeedbackSlot(slot)`.
 */
export function useFeedbackSlot(name: SlotName): FeedbackSlot {
  const [slot] = useState(() => createFeedbackSlot(name))
  useEffect(function ownSlotWhileMounted() {
    const unregister = registerFeedbackSlot(slot)
    return () => {
      unregister()
      slot.destroy()
    }
  }, [slot])
  return slot
}

/**
 * Watch a slot and read its top message: the message it draws right now, or
 * null, and a re-render of the caller whenever that changes. The pill and
 * the columns that swap a row for the pill read it; for the value alone,
 * with no re-render, `slot.getTop()`.
 */
export function useWatchAndGetTopFeedbackMsg(slot: FeedbackSlot): FeedbackMessage | null {
  return useSyncExternalStore(slot.subscribe, slot.getTop)
}

/**
 * Watch a slot without reading it: the caller re-renders whenever the slot's
 * top message changes, and decides for itself what to look at
 * (`slot.peek()`, usually). For a hook that keys something on a slot entry
 * being present.
 */
export function useWatchFeedbackSlot(slot: FeedbackSlot): void {
  useSyncExternalStore(slot.subscribe, slot.getTop)
}
