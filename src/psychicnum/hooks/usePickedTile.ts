// cs-unmet

import { useCallback, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { GTile } from '../types'

/**
 * The tile the player has picked as their next guess. Returns:
 *
 *   tile       the pick, or null — what Submit sends
 *   shownTile  the pick as the board draws it: `tile`, or null while it must
 *              not be drawn
 *   choose     pick a tile, or un-pick with null — the player's own gesture
 *   clear      un-pick, for Submit
 *
 * The hook holds the pick's ID and hands back the live tile from `tilesById`,
 * so what it returns is always the board's own object — the one `gd` built on
 * the last blob, with that blob's `correct` and `decidedBy` — never a copy
 * taken at pick time.
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
  tilesById,
  localFeedbackSlot,
  isStillPlaying,
  isViewingHistory,
}: {
  // The live board's tiles, by id (`gd.me.board.tilesById`).
  tilesById: ReadonlyMap<string, GTile>
  localFeedbackSlot: FeedbackSlot
  isStillPlaying: boolean
  isViewingHistory: boolean
}): {
  // The pick, or null.
  tile: GTile | null
  // The pick as the board draws it; null while it must not be drawn.
  shownTile: GTile | null
  // Pick a tile, or un-pick with null; dismisses the slot's result too.
  choose: (tile: GTile | null) => void
  // Un-pick without touching the slot.
  clear: () => void
} {
  const [pickedTileId, setPickedTileId] = useState<string | null>(null)

  const choose = useCallback(
    (tile: GTile | null) => {
      localFeedbackSlot.dismiss()
      setPickedTileId(tile === null ? null : tile.id)
    },
    [localFeedbackSlot],
  )
  const clear = useCallback(() => setPickedTileId(null), [])

  // A pick names a tile on the live board, so the lookup cannot miss.
  const tile = pickedTileId === null ? null : tilesById.get(pickedTileId)!
  const isPickShown = isStillPlaying && !isViewingHistory
  return {
    tile,
    shownTile: isPickShown ? tile : null,
    choose,
    clear,
  }
}
