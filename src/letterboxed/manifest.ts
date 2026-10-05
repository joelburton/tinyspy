// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_LETTERBOXED_SETUP_COMPETE,
  DEFAULT_LETTERBOXED_SETUP_COOP,
  letterboxedSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * letterboxed's registration with the shell — **two manifests, one schema, one
 * folder.**
 *
 * "letterboxed" is the codename for our NYT-Letter-Boxed-style word chainer:
 * twelve letters three to a side of a square, words that never take two
 * letters from one side and always start where the last word ended, until all
 * twelve are touched. The user-facing brand is **SnakeBox** (the `BRAND` const
 * below); gametype / schema / folder are all `letterboxed`.
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame` and
 * CSS. The mode branches at render time on `gd.mode`. The sibling-manifest
 * pattern's canonical write-up is in
 * [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern).
 *
 * Differences between the two: the `gametype` string, the `mode` declaration,
 * `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete `[2,6]`), and the
 * per-mode `summaryFor` vocabulary.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `gd.mode` for the compete-only
// OpponentStrip + win-vs-loss verdict copy.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to the
 * edge function, which samples a seed, partitions it into a board, and calls
 * `letterboxed.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is chosen in Deno — it needs the seed table — so this goes
    // through an edge function rather than straight to the RPC, and comes back
    // the same envelope a direct create_game returns, relayed untouched (see
    // _shared/startGame.ts).
    runEdgeFn<CreatedGame>('letterboxed-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout is
// mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`letterboxed`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'SnakeBox'

/** Letters on the board — the denominator every label reports against. */
const BOARD_SIZE = 12

/**
 * COOP's club line is the shared chain's progress: how much of the board is
 * covered, and how much of the word budget is spent.
 */
function makeCoopLabel(summary: GSummaryData): string {
  // Coop always has a team.
  const team = summary.team!
  const progress = `${team.nCoveredLetters}/${BOARD_SIZE} letters`
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), progress, `${team.nWordsUsed}/${summary.maxWords} words`)
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won'), count(team.nWordsUsed, 'word'))
    // The clock and the group calling it are the two coop endings without a
    // win; only the clock's is a loss.
    case 'lost':
      return statusLine(verdict('Lost', summary.ending.reason === 'timeout' ? 'out of time' : null), progress)
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), progress)
    default:
      return outcome
  }
}

/**
 * COMPETE's club line. The race ENDS on the first solve — the bar is "cover
 * the twelve inside the cap", and being first past it is the whole game — so a
 * win names the winner and their chain's length. A timeout instead resolves on
 * the most letters covered, which is a different sentence.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[]): string {
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), `best ${summary.nBestCoveredLetters}/${BOARD_SIZE}`)
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won': {
      const winner = summary.ending.winner
      const name = winner === null ? undefined : memberById(members, winner)?.username
      return summary.ending.reason === 'timeout'
        ? statusLine(wonBy(name), `${summary.nWinnerCoveredLetters}/${BOARD_SIZE} letters`)
        : statusLine(wonBy(name), count(summary.nWinnerWords, 'word'))
    }
    case 'lost':
      return statusLine(
        verdict('Lost', summary.ending.reason === 'conceded' ? 'all conceded' : null),
        'nobody finished',
      )
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), 'no winner')
    default:
      return outcome
  }
}

export const letterboxedCoopGame: GameManifest = {
  gametype: 'letterboxed_coop',
  schema: 'letterboxed',
  baseGametype: 'letterboxed',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Chain words around the box, together',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in letterboxed.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'One shared chain. Each word starts with the last letter of the one before it, and no word may use two letters from the same side. Together, touch all twelve letters.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COOP,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

export const letterboxedCompeteGame: GameManifest = {
  gametype: 'letterboxed_compete',
  schema: 'letterboxed',
  baseGametype: 'letterboxed',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to touch all twelve letters',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Same twelve letters, a private chain each. First to touch all twelve within the word limit wins; until then you only see how far the others have got, not their words.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COMPETE,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members) => makeCompeteLabel(data as GSummaryData, members),

  submitTimeout,
  stopGame,
}
