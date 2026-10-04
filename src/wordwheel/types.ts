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
  GBeeFoundWord,
  GBeeFoundWordRaw,
  GBeeGameData,
  GBeeGameDataRaw,
  GBeePlayer,
  GBeePlayerRaw,
  GBeePuzzle,
  GBeeStateLineData,
  GBeeSummaryData,
  GBeeTeam,
  GBeeTile,
  GBeeWord,
} from '@/shared/bee-games/beeGameData'
import type { WordwheelSetup } from './lib/setup'

/** wordwheel's `game_data`, as `wordwheel._rebuild_data_cols` writes it
 *  (supabase/sql/wordwheel.sql → The page blobs). */
export type GGameDataRaw = GBeeGameDataRaw<WordwheelSetup>

/** `gd`: the blob read for the surface — players, the seat rule applied. */
export type GGameData = GBeeGameData<WordwheelSetup>

export type GPlayerRaw = GBeePlayerRaw
export type GPlayer = GBeePlayer
export type GPuzzle = GBeePuzzle
export type GTile = GBeeTile
export type GWord = GBeeWord
export type GTeam = GBeeTeam
export type GFoundWordRaw = GBeeFoundWordRaw
export type GFoundWord = GBeeFoundWord
export type GStateLineData = GBeeStateLineData
export type GSummaryData = GBeeSummaryData

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
