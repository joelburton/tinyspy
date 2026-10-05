// cs-unmet

import { useMemo, useState } from 'react'
import { clickTile } from '../lib/trace'
import type { GGameData, GTrace } from '../types'

/** Stable empty trace, so the derived clear below doesn't hand React a new
 *  array identity on every render. */
const NO_TILE_IDS: readonly string[] = []

/**
 * The word being traced on my board: held as tile ids, handed back as the
 * live tiles (`gd.puzzle.tilesById`), with the moves that change it.
 *
 * A teammate's find can consume tiles I have traced, which would leave my
 * trace running through tiles I no longer own. That clear is derived during
 * render rather than made in an effect: a find that doesn't touch my trace
 * leaves it alone, where a blanket reset would snatch away a good trace every
 * time anyone else scored.
 */
export function useTrace(gd: GGameData): GTrace {
  // The trace as picked, before a teammate's find is taken into account.
  const [pickedTileIds, setPickedTileIds] = useState<readonly string[]>(NO_TILE_IDS)

  const consumedTileIds = useMemo(
    () => new Set(gd.me.board.foundPuzzleWords.flatMap((w) => w.tiles.map((t) => t.id))),
    [gd.me.board.foundPuzzleWords],
  )
  const tileIds = pickedTileIds.some((id) => consumedTileIds.has(id)) ? NO_TILE_IDS : pickedTileIds
  const tiles = useMemo(
    () => tileIds.map((id) => gd.puzzle.tilesById[id]!),
    [tileIds, gd.puzzle.tilesById],
  )

  // Each move starts from the trace on screen — after a teammate's find has
  // emptied it, popping the picked one would resurrect its stale prefix.
  return {
    tiles,
    consumedTileIds,
    click: (tile) => setPickedTileIds(clickTile(tiles, tile, consumedTileIds).map((t) => t.id)),
    extend: (tile) => setPickedTileIds([...tileIds, tile.id]),
    dropLast: () => setPickedTileIds(tileIds.slice(0, -1)),
    clear: () => setPickedTileIds(NO_TILE_IDS),
  }
}
