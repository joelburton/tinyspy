/**
 * Wordknit's per-game setup config.
 *
 * Empty for the POC: the create_game RPC uses a hardcoded
 * board and doesn't read anything from the config jsonb. The
 * setup dialog renders a placeholder message gesturing at the
 * future date-picker (so the UX flow is in place and we can
 * evolve the form when puzzle archives land).
 *
 * Future shape (probably): `{ puzzleDate: "YYYY-MM-DD" }`. The
 * RPC would look up the puzzle by date in a connections-archive
 * table, replacing the hardcoded board.
 */
export type WordknitConfig = Record<string, never>

/**
 * Initial config the manifest hands the SetupGameDialog wrapper
 * as `defaults`. Empty object literal — matches `WordknitConfig`.
 */
export const DEFAULT_WORDKNIT_CONFIG: WordknitConfig = {}
