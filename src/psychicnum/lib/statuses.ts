// cs-unmet

import type { PlayerEndedReason } from '@/common/terminal/gameEnding'

/**
 * psychicnum's three copies, as `psychicnum._write_statuses` writes them
 * (supabase/sql/psychicnum.sql). Every key is always present, null when it
 * has no value, so no key here is optional. The info column and the opponent
 * strip read the first two; the club line reads the third.
 */

/** `common.games.game_status`: the table-facts, fixed at create. */
export type PsychicnumGameStatus = {
  required_secrets_count: number
  max_guesses: number
}

/**
 * One player's `common.game_players.player_status`. Both counts are that
 * player's own, in both modes; coop's team numbers are their sums over the
 * players.
 */
export type PsychicnumPlayerStatus = {
  found_secrets_count: number
  guesses_used: number
  player_ended_reason: PlayerEndedReason | null
}

/**
 * `common.games.clubpage_info`. The found and used counts are the team's in
 * coop and null in compete, whose club line shows no progress; the winner is
 * compete's, null until the end and always null in coop.
 */
export type PsychicnumClubpageInfo = {
  found_secrets_count: number | null
  required_secrets_count: number
  guesses_used: number | null
  max_guesses: number
  winner_user_id: string | null
}
