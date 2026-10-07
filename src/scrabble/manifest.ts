// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { DEFAULT_SCRABBLE_SETUP, validateScrabbleSetup } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * scrabble's registration with the shell — a Scrabble-style word game
 * (codename `scrabble`); see docs/games/scrabble.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `scrabble` schema and the PlayArea / SetupForm / Help, differing on the
 * gametype string, name, mode, and numberOfPlayers. The setup is the
 * dictionary band + an optional timer; the countdown ends via
 * `submitTimeout`.
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

/** Shared start-game caller. `mode` is the per-manifest constant; the RPC
 *  routes on it to write the right gametype string + per-mode dealing. */
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
 * COOP's club line: the team's score, and how much bag is left while it plays.
 * The bag played out is a `won` outcome — every teammate ranked first — but
 * the line says "Ended": the score is the point, not a verdict. Only the clock
 * loses.
 */
function makeCoopLabel(summary: GSummaryData): string {
  // Coop always has a team.
  const score = `${summary.team!.score} pts`
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), score, count(summary.nBagTiles, 'tile left', 'tiles left'))
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    // The bag played out, and a Stop.
    case 'won':
    case 'neutral':
      return statusLine(verdict('Ended'), score)
    case 'lost':
      return statusLine(verdict('Lost', 'out of time'), score)
    default:
      return outcome
  }
}

/**
 * COMPETE's label. A win names the players with the highest score and the
 * score they share; a tie names every one of them.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), count(summary.nBagTiles, 'tile left', 'tiles left'))
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      // A won race has its winners and the score they share.
      const names = findWinnerIds(summary).map((id) => memberById(members, id)?.username ?? 'someone')
      const score = `${summary.winnerScore!} pts`
      return names.length > 1
        ? statusLine(verdict('Won', 'tied'), names.join(' & '), score)
        : statusLine(wonBy(names[0]), score)
    }
    case 'lost':
      return verdict('Lost', summary.ending.reason === 'conceded' ? 'all conceded' : null)
    // A Stop.
    case 'neutral':
      return verdict('Ended')
    default:
      return outcome
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'RackAttack'

export const scrabbleCoopGame: GameManifest = {
  gametype: 'scrabble_coop',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Build words together on one board',
  logoUrl,
  help: helpLoader,
  // Solo or coop up to 4. Must agree with _require_player_count_max(4).
  numberOfPlayers: [1, 4],
  // Pre-play: a waiting player may lay a move out; only submitting waits.
  draftsOffTurn: true,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SCRABBLE_SETUP,
    intro:
      'Build words on the board from your rack of tiles. A word is accepted if it\'s in the dictionary at the difficulty you pick for its length.',
  },
  startGameInClub: startGameInClubFactory('coop'),
  summaryFor: (data) => makeCoopLabel(data as GSummaryData),
  submitTimeout,
  stopGame,
}

export const scrabbleCompeteGame: GameManifest = {
  gametype: 'scrabble_compete',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'compete',
  // Solo play seats an autonomous AI opponent (docs/games/scrabble.md → The AI
  // opponent), so a solo club's mode
  // pill says "AI Compete" (vs bananagrams' pill-less "compete for 1").
  aiOpponent: true,
  name: BRAND,
  shortDescription: 'Race for the highest score',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player — but an AI counts, so the HUMAN floor is
  // 1 (solo vs AI). The real "≥2 total (humans + AI)" floor is enforced by the
  // setup `validate` below + the RPC. Max 4 total.
  numberOfPlayers: [1, 4],
  // Pre-play: a waiting player may lay a move out; only submitting waits.
  draftsOffTurn: true,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  // `validate` blocks Start when an AI is present and the dictionary is too
  // narrow for its level, or the head-count doesn't fit (docs/games/scrabble.md).
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SCRABBLE_SETUP,
    validate: validateScrabbleSetup,
    intro:
      'Build words on the board from your rack of tiles. A word is accepted if it\'s in the dictionary at the difficulty you pick for its length.',
  },
  startGameInClub: startGameInClubFactory('compete'),
  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),
  submitTimeout,
  stopGame,
}
