// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, tally, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  DEFAULT_WORDIPLY_SETUP_COOP,
  wordiplySetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * wordiply's registration with the shell — **two manifests, one schema,
 * one folder.**
 *
 * "wordiply" is the codename for our Guardian-Wordiply-style base extender:
 * a short BASE (a 2–4 letter combination, not a dictionary word) that every
 * guess must contain, longer than the base, across five guesses. The
 * user-facing brand is **WordWire** (the `BRAND` const below); gametype /
 * schema / folder are all `wordiply`. See docs/games/wordiply.md for the
 * rules + architecture (the shipped legal list the FE validates locally,
 * length-only live readout, the compete length-score comparator).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame`,
 * and CSS. The mode branches at render time on `gd.mode`. The
 * sibling-manifest pattern's canonical
 * write-up is in [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern);
 * wordiply follows it.
 *
 * Differences between the two manifests: the `gametype` string, the `mode`
 * declaration, `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete
 * `[2,6]`), and the per-mode `summaryFor` vocabulary. Neither carries a
 * `target_rank` — wordiply is not a race-to-rank.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `game.mode` for the compete-only
// OpponentStrip + win-vs-loss verdict copy.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to
 * the edge function, which builds the board and calls
 * `wordiply.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The starter is chosen in Deno, so this goes through an edge function
    // rather than straight to the RPC — but it comes back the same envelope a
    // direct create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('wordiply-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout
// is mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`wordiply`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'WordWire'

/** The length score as the label prints it: `78%`. */
const percent = (score: number | null) => (score === null ? null : `${score}%`)

/**
 * Coop's club line. Mid-game it shows only the words used (the scores wait for
 * the end, per the "length only during play" rule); once ended, the team's
 * length score and letter count. The five words spent is a win, but coop's
 * words never say "Won" — the team did as well as it did, and the score says
 * how well; a timeout is the one loss.
 */
function makeCoopLabel(summary: GSummaryData): string {
  // Coop always has a team.
  const team = summary.team!
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), tally(team.nGuessesUsed, summary.maxGuesses, 'guesses'))
  }
  const scores = [percent(team.lengthScore), count(team.nLetters, 'letter')]
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Ended', 'out of guesses'), ...scores)
    case 'lost':
      return statusLine(verdict('Lost', 'out of time'), ...scores)
    // A Stop (stop_game).
    case 'neutral':
      return statusLine(verdict('Ended'), ...scores)
    default:
      return outcome
  }
}

/**
 * Compete's club line. Mid-race it shows no progress: a race has no team, and
 * the words are private until the end. Once won, the winner and their length
 * score; a race nobody scored in is a collective loss, and the label says how
 * it ended.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  if (summary.ending === null) return verdict('Playing')
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      const winner = findWinnerIds(summary)[0] ?? null
      const name = winner === null ? undefined : memberById(members, winner)?.username
      return statusLine(wonBy(name), percent(summary.winnerLengthScore))
    }
    case 'lost':
      // "all conceded" already says nobody won; the others need spelling out.
      return summary.ending.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(
          verdict('Lost', summary.ending.reason === 'timeout' ? 'out of time' : 'out of guesses'),
          'nobody scored')
    // A Stop (stop_game).
    case 'neutral':
      return statusLine(verdict('Ended'), 'no winner')
    default:
      return outcome
  }
}

export const wordiplyCoopGame: GameManifest = {
  gametype: 'wordiply_coop',
  schema: 'wordiply',
  baseGametype: 'wordiply',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Extend a base in five guesses, together',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in wordiply.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Everyone in the club shares five guesses. Each guess must contain the starter and be longer than it; together you\'re hunting the longest word.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COOP,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

export const wordiplyCompeteGame: GameManifest = {
  gametype: 'wordiply_compete',
  schema: 'wordiply',
  baseGametype: 'wordiply',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to the longest word from a shared base',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Each player gets their own five guesses off the same starter. The longest word wins; until the end you only see how many guesses each other has spent, not the words.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COMPETE,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),

  submitTimeout,
  stopGame,
}
