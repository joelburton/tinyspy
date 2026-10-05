// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { DEFAULT_STACKDOWN_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * stackdown's registration with the shell. A mahjong-style word game:
 * clear a stack of lettered tiles by spelling words off the exposed
 * ones — see docs/games/stackdown.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `stackdown` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, name, mode, and numberOfPlayers. The per-game setup
 * is just an optional countdown timer (the board is dealt at random),
 * ended server-side via `submitTimeout`.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and claim a
 *  random board from the library. */
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

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * COOP's club line: the team's progress through the six words, and the
 * dictionary band — the words a stack is built from change its difficulty
 * completely. The clock is the only loss: there is no move budget, and every
 * board is clearable.
 */
function makeCoopLabel(summary: GSummaryData): string {
  // Coop always has a team.
  const found = tally(summary.team!.nFoundWords, summary.nReqdWords, 'words')
  const dict = dictLabel(summary.band)
  if (summary.ending === null) return statusLine(verdict('Playing'), found, dict)
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won'), dict)
    case 'lost':
      return statusLine(verdict('Lost', summary.ending.reason === 'timeout' ? 'out of time' : null), found, dict)
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), found, dict)
    default:
      return outcome
  }
}

/**
 * COMPETE's club line names no count: each racer's words are hidden from the
 * others, and the line is club-wide readable. The first to clear wins; the
 * clock, or the last racer conceding, ends it with no winner.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  const dict = dictLabel(summary.band)
  if (summary.ending === null) return statusLine(verdict('Playing'), dict)
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      const winner = summary.ending.winner
      return statusLine(wonBy(winner === null ? undefined : memberById(members, winner)?.username), dict)
    }
    case 'lost':
      return summary.ending.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), 'no winner')
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), dict)
    default:
      return outcome
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'StackDown'

export const stackdownCoopGame: GameManifest = {
  gametype: 'stackdown_coop',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Clear the tile stack together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'A random tile-stack is dealt when the game starts. Clear it by spelling words off the exposed tiles.',
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

export const stackdownCompeteGame: GameManifest = {
  gametype: 'stackdown_compete',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to clear the tile stack',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Lower bound 2; the RPC enforces it.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'A random tile-stack is dealt when the game starts. Clear it by spelling words off the exposed tiles.',
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),

  submitTimeout,
  stopGame,
}
