// cs-unmet

/**
 * wordwheel's types — every type this game exports, in one place. The `G`
 * says a type is this game's and not the shell's (docs/code-conventions.md →
 * A game's types). The shapes themselves are the bee games' shared ones
 * (`shared/bee-games/beeGameData.ts`), since wordwheel and wordwheel write
 * one blob; this file names them as wordwheel's, over wordwheel's own
 * setup type.
 */

import type {
  GBeeEvent,
  GBeeEventRaw,
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
export type GEventRaw = GBeeEventRaw
export type GEvent = GBeeEvent
export type GStateLineData = GBeeStateLineData
export type GSummaryData = GBeeSummaryData
