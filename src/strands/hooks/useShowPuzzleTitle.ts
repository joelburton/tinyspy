// cs-unmet

import { useEffect } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { GGameData, GTrace } from '../types'

/**
 * The puzzle's title, quoted, in the local slot on an untouched board — what
 * an empty slot says before anything has happened. The title also sits in the
 * info column, but that column is off-canvas on a phone.
 *
 * It leaves the moment a trace begins (the entry needs the row) and comes back
 * if that trace is taken back or rejected, until the first row is logged — a
 * `prompt`, which everything else outranks.
 */
export function useShowPuzzleTitle({
  gd,
  trace,
  localFeedbackSlot,
}: {
  gd: GGameData
  trace: GTrace
  localFeedbackSlot: FeedbackSlot
}): void {
  const isUntouched = gd.events.length === 0 && trace.tiles.length === 0
  const title = gd.puzzle.title
  useEffect(function showPuzzleTitle() {
    if (!isUntouched) return
    const id = localFeedbackSlot.show(FeedbackMessage.prompt(`“${title}”`))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isUntouched, title])
}
