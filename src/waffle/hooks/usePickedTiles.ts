// cs-unmet

import { useState } from 'react'
import type { GTile } from '../types'

/**
 * The tiles picked up for the next swap, in pick order — one from a tap, up to
 * two from the keyboard — and the three gestures that change them. Every
 * gesture is quiet while `canPick` is false; a gesture that completes a pair
 * swaps it through `swap` and drops the picks.
 *
 *   tileIds   the picks' ids, in pick order
 *   tap       with nothing picked it picks; on the one picked tile it cancels;
 *             on another it swaps the two. Two picked is a keyboard state, and
 *             a tap there starts over from the tapped tile.
 *   toggle    Space: the tile into or out of the picks. A third is refused, as
 *             connections refuses a fifth — un-pick one first.
 *   drop      a drag of one tile onto another: swaps them
 *   clear     drop the picks
 *
 * The hook holds ids and looks the tiles up in `tilesById` — the board as
 * drawn — so a swap is handed the board's own tiles.
 */
export function usePickedTiles({
  tilesById,
  canPick,
  swap,
}: {
  // The board's tiles, by id.
  tilesById: ReadonlyMap<string, GTile>
  // My move, on the live board, with no swap out.
  canPick: boolean
  swap: (a: GTile, b: GTile) => void
}): {
  tileIds: readonly string[]
  tap: (tile: GTile) => void
  toggle: (tile: GTile) => void
  drop: (from: GTile, to: GTile) => void
  clear: () => void
} {
  const [tileIds, setTileIds] = useState<readonly string[]>([])

  function tap(tile: GTile) {
    if (!canPick) return
    const [firstId] = tileIds
    if (tileIds.length === 1 && firstId === tile.id) {
      setTileIds([])
    } else if (tileIds.length === 1 && firstId !== undefined) {
      swap(tilesById.get(firstId)!, tile)
      setTileIds([])
    } else {
      setTileIds([tile.id])
    }
  }

  function toggle(tile: GTile) {
    if (!canPick) return
    if (tileIds.includes(tile.id)) setTileIds(tileIds.filter((id) => id !== tile.id))
    else if (tileIds.length < 2) setTileIds([...tileIds, tile.id])
  }

  function drop(from: GTile, to: GTile) {
    if (!canPick || from.id === to.id) return
    swap(from, to)
    setTileIds([])
  }

  return { tileIds, tap, toggle, drop, clear: () => setTileIds([]) }
}
