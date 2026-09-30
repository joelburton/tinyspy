// cs-unmet

import type { PlayerEndedReason } from '@/common/terminal/gameEnding'

/**
 * wordle's three copies, as `wordle._write_statuses` writes them
 * (supabase/sql/wordle.sql). Every key is always present, null when it has no
 * value, so no key here is optional. The info column and the opponent strip
 * read the first two; the club line reads the third.
 */

/** `common.games.game_status`: the table-facts, fixed at create. */
export type WordleGameStatus = {
  max_guesses: number
}

/**
 * One player's `common.game_players.player_status`. In coop `guesses_used` is
 * the team's, the same on every row; in compete it is the player's own.
 */
export type WordlePlayerStatus = {
  guesses_used: number
  player_ended_reason: PlayerEndedReason | null
  // Compete: the earlier solve, not the guess count, placed this player
  // against the winner — the winner when another solver matched their count,
  // or a solver on the winner's count. Null in coop and until the game ends.
  tie_broken_by_clock: boolean | null
}

/**
 * `common.games.clubpage_info`. `guesses_used` is coop's shared count and null
 * in compete, whose club line shows no progress; the winner and their count
 * are compete's, null until the end and always null in coop. `answer_band` is
 * the setup's.
 */
export type WordleClubpageInfo = {
  guesses_used: number | null
  max_guesses: number
  answer_band: number
  winner_user_id: string | null
  winner_guesses_count: number | null
}
