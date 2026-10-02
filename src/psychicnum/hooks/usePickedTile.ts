// cs-unmet

import { useCallback, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { TileWord } from '../lib/tileResults'

/**
 * The word the player has picked as their next guess. Returns:
 *
 *   tile       the pick, or null — what Submit sends
 *   shownTile  the pick as the board draws it: `tile`, or null while it must
 *              not be drawn
 *   choose     pick a word, or un-pick with null — the player's own gesture
 *   clear      un-pick, for Submit
 *
 * `shownTile` is null while I cannot play (the game ended, or I have ended) and
 * while a past turn is open: a pick means "the move I am building", and a tile
 * picked just before either moment must not keep its border, since nothing
 * else would take it off. Waiting my turn is not that: the pick stays for when
 * the turn comes back.
 *
 * `choose` is a gesture (a tile, Space, Clear), so it also dismisses a result
 * the slot shows until the next gesture. `clear` is for Submit, which is about
 * to show a result of its own and must not dismiss it.
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
  // The pick, or null.
  tile: TileWord | null
  // The pick as the board draws it; null while it must not be drawn.
  shownTile: TileWord | null
  // Pick a word, or un-pick with null; dismisses the slot's result too.
  choose: (word: TileWord | null) => void
  // Un-pick without touching the slot.
  clear: () => void
} {
  const [pickedTile, setPickedTile] = useState<TileWord | null>(null)

  const choose = useCallback(
    (word: TileWord | null) => {
      localFeedbackSlot.dismiss()
      setPickedTile(word)
    },
    [localFeedbackSlot],
  )
  const clear = useCallback(() => setPickedTile(null), [])

  const isPickShown = isStillPlaying && !isViewingHistory
  return {
    tile: pickedTile,
    shownTile: isPickShown ? pickedTile : null,
    choose,
    clear,
  }
}
