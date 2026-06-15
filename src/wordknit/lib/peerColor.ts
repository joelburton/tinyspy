/**
 * Stable user-id → peer color mapping for the shared-selection
 * frames in BoardScreen. The same user_id always produces the
 * same color so a player "is" a color across sessions and
 * devices — you learn that "Bea's frame is the teal one."
 *
 * Palette avoids the NYT level colors (yellow/green/blue/purple)
 * to prevent confusion between "tile selected by Bea" and "tile
 * revealed as part of the green group." Five distinct hues, all
 * dark enough to read as a 3-4px border around a tile.
 *
 * The hash is a tiny DJB2 over the uuid string — deterministic,
 * no dependencies, well-distributed enough for ≤5 friends.
 */

const PALETTE = [
  '#e8590c', // orange
  '#0c8599', // teal
  '#c2255c', // magenta
  '#5f3dc4', // indigo (distinguishable from NYT purple)
  '#2b8a3e', // forest (distinguishable from NYT green)
] as const

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i)
  }
  return h >>> 0  // force unsigned 32-bit
}

export function colorForUserId(userId: string): string {
  return PALETTE[djb2(userId) % PALETTE.length]
}
