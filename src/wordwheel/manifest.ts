// cs-blessed-wordwheel

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_WORDWHEEL_SETUP_COMPETE,
  DEFAULT_WORDWHEEL_SETUP_COOP,
  wordwheelSetupError,
} from './lib/setup'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

/**
 * wordwheel's registration with the shell — **two manifests, one
 * schema, one folder.** "wordwheel" is the codename; the brand is `BRAND`
 * below. The game itself is `doc.md`.
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame`
 * and CSS; the mode branches at render time on `game.mode`, which
 * `create_game` writes onto `wordwheel.games` from its own `mode`
 * argument. Two rows in `common.gametypes`, one set of tables — the
 * sibling-manifest pattern (docs/common.md → The sibling-manifest pattern).
 *
 * What differs between the two: the `gametype` string (the URL segment and
 * registry key), `mode`, `numberOfPlayers` (compete needs an opponent), the
 * setup defaults (compete seeds a target rank), the dialog's intro, and
 * `summaryFor`'s vocabulary.
 */

// Help loader is shared — both modes link to the same rules modal.
// Lazy so the prose ships in wordwheel's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// One surface for both modes — it branches on `game.mode` for the
// compete-only OpponentStrip and the win-vs-loss verdict.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// SetupForm is shared — the target-rank picker's caption and its "None"
// option follow the SetupBodyProps.mode prop.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to the
 * edge function, which builds the board and calls
 * `wordwheel.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The wheel is chosen in Deno, so this goes through an edge function rather
    // than straight to the RPC — but it comes back the same envelope a direct
    // create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('wordwheel-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs). submit_timeout writes the ending the mode
// calls for, and is idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with the team's progress, null in compete, and what it is measured against).

/** The team's points against the required set's. */
function pointsTally(summary: GSummaryData) {
  return `${summary.team!.foundWordsScore}/${summary.reqdWordsScore} pts`
}

/** The team's finds against the required set's count. */
function wordsTally(summary: GSummaryData) {
  return tally(summary.team!.nFoundWords, summary.nReqdWords, 'words')
}

/** The rank the game set out for, for a label; a coop game with none never
 *  reads it, and a race always has one. */
function targetRankName(summary: GSummaryData) {
  return RANKS[summary.targetRankIdx ?? 0]
}

/** A member's username, or undefined for an id that names nobody. */
function usernameOf(members: readonly Member[], userId: string | null) {
  return userId === null ? undefined : memberById(members, userId)?.username
}

// The single source of truth for this game's user-facing brand name.
// Both sibling manifests set `name: BRAND`, and the start-game error
// reads it too — so a fork rebrands by editing this one line. The
// codename (`wordwheel`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'MooseWheel'

export const wordwheelCoopGame: GameManifest = {
  gametype: 'wordwheel_coop',
  schema: 'wordwheel',
  baseGametype: 'wordwheel',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words on a 9-letter wheel',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6).
  // Must agree with the player-count guard in
  // wordwheel.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Everyone in the club types words into the same wheel and the team racks up the score together.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COOP,
    validate: (setup) => wordwheelSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => {
    const summary = data as GSummaryData
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), pointsTally(summary), wordsTally(summary))
    }
    // Written with the ending.
    const outcome = summary.outcome!
    switch (outcome) {
      case 'won':
        // The rank named is the one the team set out for. "Won at …" is one
        // phrase, not two facts — no separator inside it.
        return statusLine(`${verdict('Won')} at "${targetRankName(summary)}"`, pointsTally(summary))
      // Ran out WITH a target to hit. (Ran out with nothing to fail at is
      // neutral below — the close of an open hunt.)
      case 'lost':
        return statusLine(verdict('Lost', 'out of time'), pointsTally(summary), wordsTally(summary))
      case 'neutral':
        return statusLine(
          verdict('Ended', summary.ending.reason === 'timeout' ? 'out of time' : null),
          pointsTally(summary),
          wordsTally(summary),
        )
      default:
        return outcome
    }
  },

  submitTimeout,
  stopGame,
}

export const wordwheelCompeteGame: GameManifest = {
  gametype: 'wordwheel_compete',
  schema: 'wordwheel',
  baseGametype: 'wordwheel',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to your chosen rank',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Each player works the same wheel independently. First to the target rank wins; the rest of the time you only see each other\'s rank, not the words you found.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDWHEEL_SETUP_COMPETE,
    validate: (setup) => wordwheelSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  // Compete's label reads the target rank mid-game and the winner at the end;
  // no racer's score reaches the listing row (`summary_data.team` is null).
  summaryFor: (data, members) => {
    const summary = data as GSummaryData
    const rank = targetRankName(summary)
    if (summary.ending === null) return statusLine(verdict('Playing'), `race to "${rank}"`)
    // Written with the ending.
    const outcome = summary.outcome!
    switch (outcome) {
      case 'won':
        return `${wonBy(usernameOf(members, summary.ending.winner))} at "${rank}"`
      // The two collective losses, told apart by the reason: the last racer
      // dropped out, or the clock beat everyone to the rank.
      case 'lost':
        return summary.ending.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', 'out of time'), `nobody reached "${rank}"`)
      // The one neutral race ending, the players agreeing to stop.
      case 'neutral':
        return statusLine(verdict('Ended'), `nobody reached "${rank}"`)
      default:
        return outcome
    }
  },

  submitTimeout,
  stopGame,
}
