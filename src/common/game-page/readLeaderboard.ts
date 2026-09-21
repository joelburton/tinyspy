// cs-unmet

/**
 * Type-narrow read for `status.leaderboard` — the per-player array a compete
 * game's RPCs rewrite on every accepted move. `gamePageCtx.ts` beside this file
 * documents that convention and hands a PlayArea the status it reads from.
 *
 * Gives back an empty array when the field is missing or is not an array. That
 * defensive half is what every caller needs: the server writes the field on
 * every submit, but a game has none before the first one, and a status blob is
 * typed `Record<string, unknown>` because each gametype writes its own shape.
 *
 * **Generic over the ROW, and deliberately without a default**, because every
 * compete game keeps a leaderboard and they do not agree on its columns — each
 * game scores differently. The narrowing is the only part they share, so the
 * row is always named at the call site: `readLeaderboard<LeaderRow>(status)`.
 * A default would have to name one family's row, and the shell may not import
 * a family (docs/common-folders.md → Common never imports shared).
 */
export function readLeaderboard<T>(status: Record<string, unknown> | null): T[] {
  if (!status) return []
  const raw = status.leaderboard
  if (!Array.isArray(raw)) return []
  return raw as T[]
}
