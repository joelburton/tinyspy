/**
 * Shared types and helpers for tile labels.
 *
 * A Duet "label" is the one-character role a cell occupies on a key view:
 *   - 'G' green agent (counts toward the 15 to find)
 *   - 'N' neutral / bystander
 *   - 'A' assassin (game over if revealed)
 *
 * Each key view (one per seat) is a length-25 array of these letters, indexed
 * by board position 0..24. See `game_players.key_card` in the schema.
 */

export type KeyLabel = 'G' | 'N' | 'A'

/**
 * Maps a label to the CSS class that paints its tile background.
 * Used in two contexts (see BoardScreen):
 *  - as a hint tint on your-key-view (translucent), or
 *  - as a solid color on a revealed cell.
 */
export const LABEL_CLASS: Record<KeyLabel, string> = {
  G: 'tile-green',
  N: 'tile-neutral',
  A: 'tile-assassin',
}

/** Human-readable name for a label, e.g. for the game log. */
export function labelName(l: string | null): string {
  if (l === 'G') return 'green'
  if (l === 'N') return 'neutral'
  if (l === 'A') return 'assassin'
  return '?'
}
