/**
 * Shared data model for the found-words rank-ladder games (spellingbee +
 * wordwheel). Both project the same `<schema>.games_state` view and the same
 * `found_words` table, so the FE shapes are identical — extracted here from the
 * two games' byte-identical `hooks/useGame.ts` type blocks.
 *
 * The board shape differs at RENDER time (a hex hive vs a 9-tile wheel) and in
 * game logic (spellingbee's letter SET vs wordwheel's letter MULTISET), but the
 * DATA that reaches the FE is the same: a center letter, an outer-letters
 * string, two scored word lists, and a rank-ladder denominator. If either game
 * grows a column, split the type back out (per-game body, same name).
 */

/** One entry of a shipped word list — required or bonus — or a required-word
 *  reveal entry. Carries points + the pangram flag so the FE validates + scores
 *  a guess (and renders the reveal) locally. */
export type FoundWordsWord = { word: string; points: number; is_pangram: boolean }

/**
 * The immutable header exposed to the FE — projected from `<schema>.games_state`.
 * Loads once (play state lives on common.games). Both word lists ship from game
 * start; the FE just doesn't RENDER the required list until terminal.
 */
export type FoundWordsGame = {
  id: string
  club_handle: string
  /** Denormalized from `<schema>.games.mode`. Drives FE branching for the
   *  OpponentStrip + win-vs-loss verdict copy in the PlayArea. */
  mode: 'coop' | 'compete'
  outer_letters: string
  center_letter: string
  /** Score of the required set — the rank-ladder denominator. */
  required_words_score: number
  /** Count of required words — the "X / Y words" goal (Y). */
  required_words_count: number
  created_at: string
  /** The required-words answer key (the displayed goal + the terminal reveal). */
  requiredWords: FoundWordsWord[]
  /** The bonus set (legal − required): accepted + scored, never revealed. */
  bonusWords: FoundWordsWord[]
}

/** One accepted guess (a row of `<schema>.found_words`). */
export type FoundWordRow = {
  game_id: string
  user_id: string
  word: string
  points: number
  is_pangram: boolean
  is_bonus: boolean
  found_at: string
}
