// cs-unmet

import { useState } from 'react'
import { livePicks } from '../lib/picks'
import type { GTile } from '../types'

/**
 * The tiles picked toward the next claim, held as ids and handed back as the
 * table's own tiles.
 *
 * A pick follows the TILE, not its slot: a rival can claim a tile out from
 * under a half-made pick, and the moment the table arrives without it, it is
 * simply not picked any more (`lib/picks.ts` → `livePicks`) — no stale
 * highlight, and no claim fired at a tile that isn't there.
 *
 *   tiles      the picks still on the table, in pick order
 *   tileIds    the ids held, for `toggleTile`
 *   set        replace the picks — a hint picks what it rings
 *   clear      drop the picks
 */
export function usePickedTiles(tilesById: Readonly<Record<string, GTile>>): {
  tiles: GTile[]
  tileIds: readonly string[]
  set: (tileIds: readonly string[]) => void
  clear: () => void
} {
  const [pickedTileIds, setPickedTileIds] = useState<readonly string[]>([])
  const tiles = livePicks(pickedTileIds, tilesById)
  return {
    tiles,
    tileIds: tiles.map((t) => t.id),
    set: setPickedTileIds,
    clear: () => setPickedTileIds([]),
  }
}
