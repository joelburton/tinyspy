// cs-unmet

/**
 * spellingbee's types — every type this game exports, in one place. The `G`
 * says a type is this game's and not the shell's (docs/code-conventions.md →
 * A game's types). The shapes themselves are the bee games' shared ones
 * (`shared/bee-games/beeGameData.ts`), since spellingbee and wordwheel write
 * one blob; this file names them as spellingbee's, over spellingbee's own
 * setup type.
 */

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
import type { SpellingbeeSetup } from './lib/setup'

/** spellingbee's `game_data`, as `spellingbee._rebuild_data_cols` writes it
 *  (supabase/sql/spellingbee.sql → The page blobs). */
export type GGameDataRaw = GBeeGameDataRaw<SpellingbeeSetup>

/** `gd`: the blob read for the surface — players, the seat rule applied. */
export type GGameData = GBeeGameData<SpellingbeeSetup>

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
