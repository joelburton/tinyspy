// cs-unmet

/**
 * wordwheel's types — every type this game exports, in one place. The `G`
 * says a type is this game's and not the shell's (docs/code-conventions.md →
 * A game's types). The shapes themselves are the bee games' shared ones
 * (`shared/bee-games/beeGameData.ts`), since wordwheel and wordwheel write
 * one blob; this file names them as wordwheel's, over wordwheel's own
 * setup type.
 */

import type { Action } from '@/common/actions/useBindAction'
import type { Mark } from '@/common/board-marks/useMark'
import type { Outcome } from '@/common/outcomes/outcomes'
import type {
  BeeFoundWord,
  BeeFoundWordRaw,
  BeeGameData,
  BeeGameDataRaw,
  BeePlayer,
  BeeFacts,
  BeeFactsRaw,
  BeePlayerRaw,
  BeePuzzle,
  BeeSummaryData,
  BeeTile,
  BeeWord,
} from '@/shared/bee-games/beeGameData'
import type { TimerMode } from '@/common/manifest/types'
import type { SetupOf } from '@/common/setup-form/types'

/** wordwheel's `game_data` and `static_game_data`, as its builders write
 *  them (supabase/sql/wordwheel.sql → The page blobs). */
export type GGameDataRaw = BeeGameDataRaw<GSetup>

/** `gd`: the blob read for the surface — players, the seat rule applied. */
export type GGameData = BeeGameData<GSetup>

export type GPlayerRaw = BeePlayerRaw
export type GPlayer = BeePlayer
export type GPuzzle = BeePuzzle
export type GTile = BeeTile
export type GWord = BeeWord
export type GFacts = BeeFacts
export type GFactsRaw = BeeFactsRaw
export type GFoundWordRaw = BeeFoundWordRaw
export type GFoundWord = BeeFoundWord
export type GSummaryData = BeeSummaryData

/**
 * Every command wordwheel offers, bound once: the info column's action row
 * places them, the menu lists them, and their keys fire them — all reading the
 * same action, so the surfaces cannot drift.
 */
export type GActions = {
  // Restart THIS board — same letters, finds wiped. A button only at the end.
  actRestart: Action
  // Start a fresh follow-up game — same setup, new board and id. A button only
  // at the end; disables itself while the create is in flight.
  actNewGame: Action
  // Drop out of a race while the others play on — hidden outside compete.
  actConcede: Action
  // Stop the game for the whole table — coop's exit; it hides itself in a race.
  actStopGame: Action
  // Print the board and the word list.
  actPrintBoard: Action
  // Leave for the club — the shell's own action, off `menu`.
  actBackToClub: Action
}

/**
 * A refused word's mark, while its answer is up: how many of each letter the
 * word used and the tiles it had clicked — the tiles it would have spent wear
 * the answer and shake — and the outcome they wear.
 */
export type GRefusedMark = Mark<{
  counts: ReadonlyMap<string, number>
  claimedTileIds: readonly string[]
  outcome: Outcome
}>

/**
 * wordwheel's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `wordwheel.create_game`.
 *
 * **Mode is NOT on this type** — it is the manifest's, picked by which Start
 * button was pressed, and `create_game` takes it as its own argument; both
 * manifests share this one setup shape.
 *
 * Fields:
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *     Per-game rather than per-gametype so friends can pick
 *     their own challenge each session.
 *   - `target_rank` — 0..6 on the Start..Genius rank ladder.
 *     REQUIRED in compete (the race's finish line — first player
 *     there wins). OPTIONAL in coop, where it's the TEAM's win
 *     threshold: reach it together and the game ends as a win.
 *     `undefined` in coop means the open-ended word hunt, which
 *     only the clock or the Stop button stops — the default, and
 *     the right pick for a group that just wants to find words.
 *   - `required_band` / `legal_band` — the vocabulary bands, each a
 *     dictionary band ceiling. `required_band` (1..6) is where
 *     the displayed goal words come from; `legal_band`
 *     (required_band..6) is the wider set of accepted/bonus words;
 *     it must contain the required band (see `legalError`). The seed
 *     pool is tagged by band, so a random board's pangram is
 *     findable at the required band, but a narrow `required_band` can
 *     still leave no board with 15 required words, which the edge
 *     function refuses under this field.
 *   - `custom_center` + `custom_letters` — an OPTIONAL player-
 *     specified letter set: the center letter + the eight other
 *     letters. When both are set (and valid — see
 *     `customLettersError`) the edge function builds a board from
 *     exactly those letters instead of sampling a random pangram
 *     seed; both empty means a random board. Works in either mode.
 *     Because the player chose the letters, a custom board skips
 *     the ≥15-required-words quality gate the random builder
 *     enforces (it only needs ≥1 required word to be playable), and
 *     the letters are NOT saved as the club's next default — a
 *     one-off, not a new baseline.
 */
export type GSetupValues = {
  timer: TimerMode
  // Required in compete; optional in coop, where it's the team's win
  // threshold (undefined = no win condition, the coop default).
  target_rank?: number
  // Required-words band (1..6); see the type-level notes.
  required_band: number
  // Legal/bonus-words band (required_band..6).
  legal_band: number
  // Optional custom board: the center letter (1) + the eight other letters.
  // Both set → custom board; both empty/undefined → random. See the type notes
  // and `customLettersError`.
  custom_center?: string
  custom_letters?: string
  // Board constraint (random boards only): when true, sample only from seeds
  // whose nine letters are ALL DISTINCT — no wheel with a doubled tile. Off
  // (undefined/false) is the default: the pool includes multiset seeds. Ignored
  // for a custom board, where the player's own letters stand as chosen. The
  // edge function enforces it by filtering the pangram pool.
  unique_letters?: boolean
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}


/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `setupRows.ts` and `PlayArea` read back. */
export type GSetup = SetupOf<GSetupValues>

/**
 * Everything that can be SAID about a word in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback. `word` is lowercase, as the engine and the rows carry it.
 */
export type GAnswer =
  // My word counted.
  | { answerType: 'accepted'; word: string; points: number; bonus: boolean; pangram: boolean }
  // A coop teammate's did, off `found_words`.
  | { answerType: 'accepted_peer'; word: string; points: number; bonus: boolean; pangram: boolean }

  // Already found — by anyone in coop, by me in compete.
  | { answerType: 'already_found'; word: string; bonus: boolean }
  // Fewer than four letters.
  | { answerType: 'too_short'; word: string }

  // Not in the list, by why: the center letter is missing…
  | { answerType: 'missing_center'; word: string; center: string }
  // …or it is simply not a word. A word the wheel's tiles cannot spell never
  // gets here: BoardCol's `submitDisabled` gate vetoes its submit.
  | { answerType: 'not_a_word'; word: string }

  // A compete opponent climbed a rank. It has no twin of mine: my own rank is
  // the RankBar's, and an opponent's words are hidden, so this is all there is.
  | { answerType: 'reached_peer'; rank: string }
