/**
 * Shared types for tile labels.
 *
 * A Duet "label" is the one-character role a cell occupies on a key view:
 *   - 'G' green agent (counts toward the 15 to find)
 *   - 'N' neutral / bystander
 *   - 'A' assassin (game over if revealed)
 *
 * Each key view (one per seat) is a length-25 array of these letters, indexed
 * by board position 0..24. The two views are stored as the `key_card_a` and
 * `key_card_b` jsonb columns on `codenamesduet.games` (see
 * supabase/migrations/20260615000001_codenamesduet.sql).
 */

export type KeyLabel = 'G' | 'N' | 'A'
