// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_BOGGLE_SETUP_COMPETE,
  DEFAULT_BOGGLE_SETUP_COOP,
  boggleSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * boggle's registration with the shell — **two manifests, one schema, one
 * folder.** Codename `boggle`; the user-facing brand is `BRAND` below. Both
 * manifests share the PlayArea, SetupForm, Help, and CSS; mode branches at
 * render time / in the RPCs. See docs/games/boggle.md for the design.
 *
 * Differences between the two: `gametype`, `mode`, `numberOfPlayers`
 * (coop allows solo `[1,8]`; compete needs an opponent `[2,8]`), the
 * `setupForm.defaults`, and the `summaryFor` vocabulary.
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

/** Shared start-game caller — invokes the board-builder edge function (the
 *  shared helper owns the error-context unwrap). */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is rolled in Deno, so this goes through an edge function rather
    // than straight to the RPC — but it comes back the same envelope a direct
    // create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('boggle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout (mode-aware + idempotent server-side) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with the team's finds, null in compete, the target and the top score).

/** The team's words and points, for a coop label. */
function teamTally(summary: GSummaryData): [string | null, string] {
  const team = summary.team!
  return [count(team.nFoundWords, 'word'), `${team.foundWordsScore} pts`]
}

/** A member's username, or undefined for an id that names nobody. */
function usernameOf(members: readonly Member[], userId: string | null) {
  return userId === null ? undefined : memberById(members, userId)?.username
}

/**
 * boggle coop. A game with a TARGET can be won or lost against it; a game
 * without one is an exercise, so any ending is neutral — the same rule
 * spellingbee applies to its rank target (boggle._finish ranks the players,
 * this just words it).
 */
function makeCoopLabel(summary: GSummaryData): string {
  const pct = summary.targetWinPercent
  if (summary.ending === null) return statusLine(verdict('Playing'), ...teamTally(summary))
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won', pct !== null ? `reached ${pct}%` : null), ...teamTally(summary))
    case 'lost':
      return statusLine(verdict('Lost', 'out of time'), ...teamTally(summary))
    case 'neutral':
      return statusLine(
        verdict('Ended', summary.ending.reason === 'timeout' ? 'out of time' : null),
        ...teamTally(summary),
      )
    default:
      return outcome
  }
}

/**
 * boggle compete. Two shapes of win: crossing the target first, and — in a
 * game with no target — holding the top score when the timer stops. A target
 * game whose timer runs out is a loss for everyone: nobody reached the bar,
 * however high the scores got. No racer's own score reaches the listing.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  const pct = summary.targetWinPercent
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), pct !== null ? `race to ${pct}%` : null)
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      const who = wonBy(usernameOf(members, summary.ending.winner))
      // A target win reads "Won by alice at 65%" — one phrase. A score race
      // has no bar to name, so the winning score goes in the facts slot.
      return summary.ending.reason === 'reached_goal' && pct !== null
        ? `${who} at ${pct}%`
        : statusLine(who, summary.topScore !== null ? `${summary.topScore} pts` : null)
    }
    // The two collective losses, told apart by the reason: the last racer
    // dropped out, or the timer beat everyone to the target.
    case 'lost':
      return summary.ending.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), 'no winner')
    // The one neutral race ending, the players agreeing to stop.
    case 'neutral':
      return statusLine(verdict('Ended'), 'no winner')
    default:
      return outcome
  }
}

// The single source of truth for this game's user-facing brand name.
const BRAND = 'MothCubes'

export const boggleCoopGame: GameManifest = {
  gametype: 'boggle_coop',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words by linking adjacent tiles',
  logoUrl,
  help: helpLoader,
  // Plays solo (1, in a solo club) or coop (up to 8). Must agree with
  // boggle.create_game's player-count guard.
  numberOfPlayers: [1, 8],
  draftsOffTurn: false,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    intro:
      'Everyone hunts the same board together and the team’s finds pile up into one score.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COOP,
    validate: (setup) => boggleSetupError(setup as GSetup),
  },
  startGameInClub: startGameInClubFactory('coop'),
  summaryFor: (data) => makeCoopLabel(data as GSummaryData),
  submitTimeout,
  stopGame,
}

export const boggleCompeteGame: GameManifest = {
  gametype: 'boggle_compete',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the most words',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  draftsOffTurn: false,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    intro:
      'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COMPETE,
    validate: (setup) => boggleSetupError(setup as GSetup),
  },
  startGameInClub: startGameInClubFactory('compete'),
  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),
  submitTimeout,
  stopGame,
}
