// cs-met-bee-games

/**
 * One row of the compete leaderboard the two bee games keep on
 * `common.games.status`. `spellingbee.submit_word` and `wordwheel.submit_word`
 * each rewrite the full array on every accepted submission.
 *
 * Two FE readers share it: the OpponentStrip, which renders each opponent's
 * current rank, and the opponent-rank-up header feedback, the compete
 * rank-climb effect in PlayArea.
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
