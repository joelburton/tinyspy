// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import {
  DEFAULT_SETGAME_SETUP_COMPETE,
  DEFAULT_SETGAME_SETUP_COOP,
  setgameSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * setgame's registration with the shell — **two manifests, one schema, one
 * folder.**
 *
 * "setgame" is the codename for our Set-style card game: eighty-one tiles over
 * four three-valued attributes, and a claim is three of them that are all-same or
 * all-different in every attribute. The codename is `setgame` rather than `set`
 * because `set` is a Postgres keyword, a TypeScript builtin, and on
 * docs/naming.md's banned-generic list. The user-facing brand is
 * **HareTrigger** (the `BRAND` const below).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame` and
 * CSS. The mode branches at render time on `gd.mode`. The sibling-manifest
 * pattern's canonical
 * write-up is in [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern).
 */

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
 * Shared start-game caller. There is no board-builder edge function — a board
 * is a shuffle, so `setgame.create_game` deals it inline (and runs the
 * deal-three rule before anyone sees the table).
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`setgame`) is unrelated
 * and stays lowercase everywhere in code.
 */
const BRAND = 'HareTrigger'

/**
 * COOP's club line: how many sets the table has taken, and how much game is
 * left. Both public — every claim happened face-up — so there is nothing to
 * withhold.
 */
function makeCoopLabel(summary: GSummaryData): string {
  const sets = count(summary.nTableSetsFound, 'set')
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), sets, `${summary.nTilesInDeck} in the deck`)
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      // No count of the tiles left behind: stranding six or nine is the
      // ordinary win. A full clear is genuinely rare (~2% of games) and worth
      // naming.
      return statusLine(verdict('Won'), sets, summary.perfectClear ? 'perfect clear' : null)
    case 'lost':
      return statusLine(verdict('Lost', 'out of time'), sets)
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), sets)
    default:
      return outcome
  }
}

/**
 * COMPETE's label. The race does NOT end on anyone finishing — nobody finishes
 * alone; the deck running dry ends it for everybody — so a win names the
 * players with the most sets, and a tie names every one of them (there is no
 * speed tiebreak).
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  if (summary.ending === null) {
    return statusLine(
      verdict('Playing'), count(summary.nTableSetsFound, 'set'), `${summary.nTilesInDeck} in the deck`)
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      // A won race has its winners and the sets they share.
      const names = summary.winnerIds!.map((id) => memberById(members, id)?.username ?? 'someone')
      const sets = count(summary.nWinnerSets!, 'set')
      return names.length > 1
        ? statusLine(verdict('Won', 'tied'), names.join(' & '), sets)
        : statusLine(wonBy(names[0]), sets)
    }
    case 'lost':
      return statusLine(
        verdict('Lost', summary.ending.reason === 'conceded' ? 'all conceded' : null),
        'nobody scored',
      )
    // A Stop.
    case 'neutral':
      return verdict('Ended')
    default:
      return outcome
  }
}

export const setgameCoopGame: GameManifest = {
  gametype: 'setgame_coop',
  schema: 'setgame',
  baseGametype: 'setgame',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Spot the sets together, and clear the deck',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree with
  // the player-count guard in setgame.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'One table, everyone hunting together. Claim three cards where each of number, color, shading and shape is either all the same or all different. You win by clearing the deck — that means no sets left to find, not using up every card.',
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COOP,
    validate: (setup) => setgameSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

export const setgameCompeteGame: GameManifest = {
  gametype: 'setgame_compete',
  schema: 'setgame',
  baseGametype: 'setgame',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Same table, same deck — claim more sets than anyone',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Same table, same deck, everyone racing. A set you claim is gone for the others, and the most sets when the deck runs dry wins. Ties are ties — nobody is separated on speed.',
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COMPETE,
    validate: (setup) => setgameSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),

  submitTimeout,
  stopGame,
}
