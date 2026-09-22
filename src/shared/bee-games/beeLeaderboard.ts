// cs-met-bee-games

/**
 * One row of the compete leaderboard the two bee games keep on
 * `common.games.status`. `spellingbee.submit_word` and `wordwheel.submit_word`
 * each rewrite the full array on every accepted submission.
 *
 * It is the compete rank payload, and everything that shows a rank goes through
 * it: the PlayArea reads it to narrate a peer's climb into the header slot, and
 * again to feed the OpponentStrip the rank it draws per opponent. Both from one
 * row, so the narration and the strip cannot disagree about where someone is.
 *
 * Read it through the shell's `readLeaderboard<LeaderboardEntry>(status)`
 * (`common/game-page/readLeaderboard.ts`), which does the narrowing every
 * compete game needs. That helper is generic with no default precisely because
 * this row is one game family's and not everyone's.
 */
export type LeaderboardEntry = {
  user_id: string
  found_words_score: number
  rank_idx: number
  found_words_count: number
}
