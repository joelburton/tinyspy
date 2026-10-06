// cs-unmet

import { useCallback, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { GPlayer, GTile } from '../types'

/**
 * The tile the keyboard has picked, waiting for Enter. Returns:
 *
 *   tile    the pick, or null — what Enter guesses and the board draws
 *   choose  pick a tile, or un-pick with null — the player's own gesture
 *   clear   un-pick, for Enter
 *
 * The hook holds the pick's ID and hands back the live tile from `tilesById`,
 * so what it returns is always the table's own object. The pick shows only
 * while I may guess and the tile still can be guessed: a turn that ends, or a
 * partner who turns the tile over in sudden death, takes the pick away
 * without anything having to clear it.
 *
 * `choose` is a gesture (Space, ⌫), so it also dismisses a result the slot
 * shows until the next gesture. `clear` is for Enter, which is about to guess.
 */
export function usePickedTile({
  tilesById,
  me,
  canGuess,
  localFeedbackSlot,
}: {
  // The live table's tiles, by id (`gd.me.board.tilesById`).
  tilesById: ReadonlyMap<string, GTile>
  // Whose pick: a tile I may no longer guess drops out of it.
  me: GPlayer
  // I may guess right now (BoardCol's `canGuess`).
  canGuess: boolean
  localFeedbackSlot: FeedbackSlot
}): {
  tile: GTile | null
  choose: (tile: GTile | null) => void
  clear: () => void
} {
  // The id of the tile picked and not yet guessed, or null.
  const [pickedTileId, setPickedTileId] = useState<string | null>(null)

  const choose = useCallback(
    (tile: GTile | null) => {
      localFeedbackSlot.dismiss()
      setPickedTileId(tile === null ? null : tile.id)
    },
    [localFeedbackSlot],
  )
  const clear = useCallback(() => setPickedTileId(null), [])

  // A pick names a tile on the live table, so the lookup cannot miss.
  const picked = pickedTileId === null ? null : tilesById.get(pickedTileId)!
  return {
    tile: canGuess && picked !== null && picked.guessableBy.has(me) ? picked : null,
    choose,
    clear,
  }
}
