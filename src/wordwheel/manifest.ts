// cs-blessed-wordwheel

import { lazy } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { makeBeeCompeteSummary, makeBeeCoopSummary } from '@/shared/bee-games/beeSummary'
import { db } from './db'
import {
  DEFAULT_WORDWHEEL_SETUP_COMPETE,
  DEFAULT_WORDWHEEL_SETUP_COOP,
  wordwheelSetupError,
} from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

// One lazy component each, shared by both modes, so each ships in wordwheel's
// chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * What wordwheel's two modes share: the schema, and the `PlayArea`,
 * `SetupForm`, `Help`, `useGame` and CSS, which branch at render time on
 * `game.mode`. Each mode's setup defaults (compete seeds a target rank), the
 * dialog's intro and the club line (`shared/bee-games/beeSummary.ts`) are the
 * leaves'. The game itself is `doc.md`.
 */
abstract class WordwheelManifest extends Manifest {
  readonly schema = 'wordwheel'
  readonly baseGametype = 'wordwheel'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'MooseWheel'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  // Branches on `game.mode` for the compete-only OpponentStrip and the
  // win-vs-loss verdict.
  readonly PlayArea = playAreaLoader
  // submit_timeout writes the ending the mode calls for, and is idempotent.
  protected readonly db = db

  // The wheel is chosen in Deno, so this goes through an edge function rather
  // than straight to the RPC — but it comes back the same envelope a direct
  // create_game returns, relayed untouched (see _shared/startGame.ts).
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('wordwheel-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }
}

class WordwheelCoopManifest extends WordwheelManifest {
  readonly gametype = 'wordwheel_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find words on a 9-letter wheel'
  // Plays solo (1 player in their solo club) or coop (up to 6).
  // Must agree with the player-count guard in
  // wordwheel.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]

  // The target-rank picker's caption and its "None" option follow the
  // SetupBodyProps.mode prop.
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Everyone in the club types words into the same wheel and the team racks up the score together.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COOP,
    validate: (setup) => wordwheelSetupError(setup as GSetup),
  }

  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    return makeBeeCoopSummary(data as GSummaryData, myId)
  }
}

class WordwheelCompeteManifest extends WordwheelManifest {
  readonly gametype = 'wordwheel_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to your chosen rank'
  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  readonly numberOfPlayers: [number, number] = [2, 6]

  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Each player works the same wheel independently. First to the target rank wins; the rest of the time you only see each other\'s rank, not the words you found.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COMPETE,
    validate: (setup) => wordwheelSetupError(setup as GSetup),
  }

  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    return makeBeeCompeteSummary(data as GSummaryData, members, myId)
  }
}

/** wordwheel in coop: the team builds one score on one wheel. */
export const wordwheelCoopManifest = new WordwheelCoopManifest()

/** wordwheel in compete: a race to the chosen rank. */
export const wordwheelCompeteManifest = new WordwheelCompeteManifest()
