// cs-unmet

import type { GTile } from '../types'

/** How many tiles a claim is. Three, always — that is what a set is. */
export const CLAIM_SIZE = 3

/**
 * The picks, minus anything that has left the board, as the board's own tiles.
 *
 * Derived every render rather than corrected in an effect, which is what makes
 * the contention case safe: a rival can claim a tile out from under a
 * half-made pick, and the moment the board arrives without it, it is simply
 * not picked any more. Its keyboard letter is free again too, because the
 * letter addresses the slot and the picks hold tile ids.
 *
 * The alternative — trusting stored state and repairing it when the board
 * changes — leaves a window where the UI shows a tile picked that is no
 * longer there, and a claim fired in that window is rejected by the server with
 * `cards-gone`.
 */
export function livePicks(
  pickedTileIds: readonly string[],
  tilesById: Readonly<Record<string, GTile>>,
): GTile[] {
  return pickedTileIds.flatMap((id) => tilesById[id] ?? [])
}

/**
 * Add a tile to the picks, or take it back out if it is already there.
 *
 * Both a click and a typed letter land here, so the two input routes cannot
 * drift apart: typing `B` twice un-picks, exactly as clicking twice does.
 * Picking past the third tile is refused — the third one completes a claim
 * and the caller submits it.
 */
export function toggleTile(pickedTileIds: readonly string[], tile: GTile): string[] {
  if (pickedTileIds.includes(tile.id)) return pickedTileIds.filter((id) => id !== tile.id)
  if (pickedTileIds.length >= CLAIM_SIZE) return [...pickedTileIds]
  return [...pickedTileIds, tile.id]
}
