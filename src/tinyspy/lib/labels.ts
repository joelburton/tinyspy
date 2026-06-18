/**
 * Shared types for tile labels.
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
