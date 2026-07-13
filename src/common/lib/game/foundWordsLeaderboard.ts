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

/** Type-narrow read for `status.leaderboard`. Returns an empty array if
 *  the field is missing or malformed (defensive — the server writes it
 *  on every submit, but pre-first-submission it's `[]`). */
export function readLeaderboard(
  status: Record<string, unknown> | null,
): LeaderboardEntry[] {
  if (!status) return []
  const raw = status.leaderboard
  if (!Array.isArray(raw)) return []
  return raw as LeaderboardEntry[]
}
