// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { GameEndedReason } from '@/common/terminal/gameEnding'
import { DEFAULT_WAFFLE_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * waffle's registration with the shell. Codename `waffle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. A Waffle-style swap-to-solve deduction puzzle — see
 * docs/games/waffle.md.
 *
 * Ships as a coop / compete sibling pair: `waffleCoopGame` (solve one
 * board together) and `waffleCompeteGame` (own board each, fewest-swaps
 * winner). Both share the `waffle` schema, the `src/waffle/` folder, and
 * the PlayArea / SetupForm / Help; they differ on gametype string, name,
 * mode, and numberOfPlayers. The per-game setup includes an optional
 * countdown timer, ended server-side via `submitTimeout`.
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
 * Shared start-game caller. The board is generated on demand by the
 * `waffle-build-board` edge function (running as the caller), which builds a
 * board for the chosen band and calls `waffle.create_game(target_club, setup,
 * players, mode, board)`. `mode` is forwarded top-level; the shared helper owns
 * the error-context unwrap.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is generated in Deno, so this goes through an edge function
    // rather than straight to the RPC — but it comes back the same envelope a
    // direct create_game returns, relayed untouched (see _shared/startGame.ts).
    // Which is why naming the answer in waffle.create_game's SQL reaches here:
    // nothing in between rewrites the payload.
    runEdgeFn<CreatedGame>('waffle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/** Why a game ended with nobody winning. */
const LOSS: Partial<Record<GameEndedReason, string>> = {
  resource_exhausted: 'out of swaps',
  timeout: 'out of time',
  conceded: 'all conceded',
}

/**
 * Coop's club line. The DICT band rides on every row: a waffle at "Universal"
 * and one at "Expert" are barely the same game, so the band is the single most
 * useful thing about a game you're deciding whether to return to. Coop shows
 * the swaps the team has left.
 */
function makeCoopLabel(summary: GSummaryData): string {
  const dict = dictLabel(summary.band)
  // Coop always has a team.
  const left = count(summary.maxSwaps - summary.team!.nSwapsUsed, 'swap left', 'swaps left')
  if (summary.ending === null) return statusLine(verdict('Playing'), left, dict)
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won'), left, dict)
    case 'lost':
      // The shared board ran out of swaps, or the clock beat it.
      return statusLine(verdict('Lost', LOSS[summary.ending.reason] ?? null), dict)
    // A Stop. No 'answer revealed' variant: revealing is a display decision on
    // an already-ended game, and the club list describes the ENDING, not what
    // the players have since looked at.
    case 'neutral':
      return statusLine(verdict('Ended'), dict)
    default:
      return outcome
  }
}

/**
 * Compete's club line. No progress: each racer has their own board and their
 * own count, and this line is club-wide readable. Once won, the winner and
 * their count.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  const dict = dictLabel(summary.band)
  if (summary.ending === null) return statusLine(verdict('Playing'), dict)
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      const winner = summary.ending.winner
      const name = winner === null ? undefined : memberById(members, winner)?.username
      return statusLine(wonBy(name), count(summary.nWinnerSwaps, 'swap', 'swaps'), dict)
    }
    case 'lost':
      // "all conceded" already says nobody won; the others need spelling out.
      return summary.ending.reason === 'conceded'
        ? verdict('Lost', LOSS.conceded)
        : statusLine(verdict('Lost', LOSS[summary.ending.reason] ?? null), 'no winner')
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
const BRAND = 'SyrupSwap'

export const waffleCoopGame: GameManifest = {
  gametype: 'waffle_coop',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Unscramble the waffle together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with
  // _require_player_count_max(6) in waffle.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

export const waffleCompeteGame: GameManifest = {
  gametype: 'waffle_compete',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to unscramble the waffle',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself is degenerate.
  // Lower bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it. Must agree with _require_player_count_max(6).
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),

  submitTimeout,
  stopGame,
}
