// cs-blessed-game-lib

/**
 * The compete-mode leaderboard payload on `common.games.status`, shared by the
 * found-words rank-ladder games (spellingbee + wordwheel — their
 * `lib/leaderboard.ts` copies were byte-identical). Each game's `submit_word`
 * rewrites the full array on every accepted submission. Two FE readers share
 * it: the OpponentStrip (renders each opponent's current rank) and the
 * opponent-rank-up header feedback (the compete rank-climb effect in PlayArea).
 */
export type LeaderboardEntry = {
  user_id: string
  found_words_score: number
  rank_idx: number
  found_words_count: number
}

/**
 * Type-narrow read for `status.leaderboard`. Returns an empty array if the
 * field is missing or malformed (defensive — the server writes it on every
 * submit, but pre-first-submission it's `[]`).
 *
 * **Generic over the ROW, because every compete game keeps a leaderboard and
 * they do not agree on its columns** — each scores differently. The defensive
 * read is the shared part; `LeaderboardEntry` is only the default, for the two
 * rank-ladder games. A game with its own row calls
 * `readLeaderboard<ItsRow>(status)` rather than writing the cast inline.
 */
export function readLeaderboard<T = LeaderboardEntry>(
  status: Record<string, unknown> | null,
): T[] {
  if (!status) return []
  const raw = status.leaderboard
  if (!Array.isArray(raw)) return []
  return raw as T[]
}
