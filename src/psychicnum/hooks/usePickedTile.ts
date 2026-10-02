// cs-unmet

import { useCallback, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TileWord } from '../lib/tileResults'

/**
 * The word the player has picked as their next guess, or null.
 *
 * `shownPickedTile` is the pick as the board draws it: null while I cannot
 * play (the game ended, or I have ended) — a pick means "the move I am
 * building", and a tile picked just before that moment must not keep its
 * border, since nothing else would take it off — and null while a past turn
 * is open. Waiting my turn is not that: the pick stays for when the turn comes
 * back.
 *
 * Two ways to change it. `choosePickedTile` is the player's own gesture (a
 * tile, Space, Clear), so it also dismisses a result the slot shows until the
 * next gesture. `clearPickedTile` is for Submit, which is about to show a
 * result of its own and must not dismiss it.
 */
export function usePickedTile({
  localFeedbackSlot,
  isStillPlaying,
  isViewingHistory,
}: {
  localFeedbackSlot: FeedbackSlot
  isStillPlaying: boolean
  isViewingHistory: boolean
}): {
  pickedTile: TileWord | null
  shownPickedTile: TileWord | null
  choosePickedTile: (word: TileWord | null) => void
  clearPickedTile: () => void
} {
  const [pickedTile, setPickedTile] = useState<TileWord | null>(null)

  const choosePickedTile = useCallback(
    (word: TileWord | null) => {
      localFeedbackSlot.dismiss()
      setPickedTile(word)
    },
    [localFeedbackSlot],
  )
  const clearPickedTile = useCallback(() => setPickedTile(null), [])

  const isPickShown = isStillPlaying && !isViewingHistory
  return {
    pickedTile,
    shownPickedTile: isPickShown ? pickedTile : null,
    choosePickedTile,
    clearPickedTile,
  }
}
