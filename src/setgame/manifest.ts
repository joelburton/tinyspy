// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
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

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return {
    mode,
    ended: summary.ended,
    reason: summary.ending?.reason ?? null,
  }
}

/** A player's ending label, from the summary, with the others at their place named. */
function makeSummaryEndingLabel(
  summary: GSummaryData,
  mode: 'coop' | 'compete',
  members: readonly Member[],
  player: SummaryPlayer,
) {
  const tiedWithNames = summary.players
    .filter((o) => o.id !== player.id && player.finalRanking !== null && o.finalRanking === player.finalRanking)
    .map((o) => findUsername(members, o.id) ?? 'someone')
  return makeEndingLabel(player, makeGameFacts(summary, mode), tiedWithNames)
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: how many sets the table has taken, and how much game is
 * left. Both public — every claim happened face-up — so there is nothing to
 * withhold. The team comes out as one, so once it ends the line leads with
 * the team's ending label (mine, when I played).
 */
function makeCoopLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const sets = count(summary.nTableSetsFound, 'set')
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), sets, `${summary.nTilesInDeck} in the deck`)
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', members, player)!
  return statusLine(makeLead(endingLabel), sets)
}

/**
 * COMPETE's label, led by my ending label once I am out of play. Nobody
 * finishes alone — the deck running dry ends it for everybody — so a win
 * names the players with the most sets, and a tie names every one of them
 * (there is no speed tiebreak).
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', members, me)
  if (summary.ending === null && myEndingLabel === null) {
    return statusLine(
      verdict('Playing'), count(summary.nTableSetsFound, 'set'), `${summary.nTilesInDeck} in the deck`)
  }

  const winningSets = summary.nWinnerSets === null ? null : count(summary.nWinnerSets, 'set')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      // My label names any tie, so a win needs only the sets after it.
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningSets)
      // Someone else won: name them, beside my place or my concession.
      if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
        return statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningSets)
      }
      return statusLine(wonBy(otherWinnerNames), winningSets)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningSets)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost'), 'nobody scored')
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
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
      'One table, everyone hunting together. Claim three cards where each of number, color, shading and shape is either all the same or all different. You win with a perfect clear: every card in a set. Running out of sets with cards left over just ends the game.',
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COOP,
    validate: (setup) => setgameSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, members, myId) => makeCoopLabel(data as GSummaryData, members, myId),

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

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
