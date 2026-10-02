// cs-unmet

import type { SummaryData } from '@/common/manifest/summaryData'
import type { PlayerEndedReason } from '@/common/terminal/gameEnding'

/**
 * wordle's copies on `common.games`, as `wordle._write_statuses` writes the
 * first two (supabase/sql/wordle.sql). Every key is always present, null when
 * it has no value, so no key here is optional. `useGame` copies the first two
 * into `gd`; the summary reads the third.
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
 * `common.games.summary_data`: the common part, and wordle's keys beside it.
 * wordle's builder writes it once wordle is on the page blobs
 * (plans/seat-view.md → The page is written, not assembled); until then the
 * club page lists no wordle game, and this is the shape its summary is written
 * against. `guessesUsed` is coop's shared count and null in compete, whose
 * summary shows no progress; the winner's count is compete's, null until the
 * end and always null in coop (the winner is the common `ending.winner`).
 * `answerBand` is the setup's.
 */
export type WordleSummaryData = SummaryData & {
  guessesUsed: number | null
  maxGuesses: number
  answerBand: number
  winnerGuessesCount: number | null
}
