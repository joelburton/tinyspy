// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { DEFAULT_STRANDS_SETUP_COMPETE, DEFAULT_STRANDS_SETUP_COOP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * strands' registration with the shell.
 *
 * "strands" is the codename for our NYT-Strands-style word search: an 8×6 board
 * whose puzzle words tile it exactly, plus a spangram that runs edge to edge and
 * names the theme. The user-facing brand is **PaulPath** (the `BRAND` const
 * below); gametype / schema / folder are all `strands`.
 *
 * **Sibling pair**, one schema and one folder. The two share every component;
 * mode branches at render time on `gd.mode`.
 *
 * The compete rules are worth stating here because they shape the UI: the
 * winner is whoever SOLVED using the fewest hints, earliest solve breaking a
 * tie — so the race does NOT end on first solve, a solver goes locally terminal
 * while the others play on, and the club label can't crown anyone until it's
 * over. Opponents see one number mid-game (hints used) and nothing about the
 * puzzle.
 *
 * **No edge function.** Unlike the games that GENERATE a board, strands copies
 * one out of the imported archive, which is a single SQL statement — so
 * `startGameInClub` calls `create_game` directly, the way wordle does.
 */

const helpLoader = lazy(() => import('./components/Help').then((m) => ({ default: m.Help })))
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** The one source of truth for the user-facing name. The codename (`strands`)
 *  is unrelated and stays lowercase everywhere in code. */
const BRAND = 'PaulPath'

/** Shared start-game caller; `mode` is the per-manifest constant. No edge
 *  function — strands copies a puzzle out of the archive, which is one SQL
 *  statement, so it calls create_game directly the way wordle does. */
function startGameInClub(mode: 'coop' | 'compete') {
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
 * COOP's club line: the team's progress as a bare count, never "n of N" — the
 * total is part of the answer, and the line is readable by the whole club. The
 * timer is the only loss: the team set a timer on a puzzle with a reachable end
 * and didn't reach it (docs/states.md).
 */
function makeCoopLabel(summary: GSummaryData): string {
  // Coop always has a team.
  const progress = count(summary.team!.nFoundWords, 'word')
  if (summary.ending === null) return statusLine(verdict('Playing'), progress)
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won'), progress)
    case 'lost':
      return statusLine(verdict('Lost', 'out of time'), progress)
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), progress)
    default:
      return outcome
  }
}

/**
 * COMPETE's club line says **nothing** until the game is over: a rival's words
 * are their race, and a winner genuinely isn't known before the end — the
 * fewest-hints ranking can be overturned by anyone still playing. At the end it
 * names the MARGIN, not the finish order: "won on 0 hints" is the contest.
 */
function makeCompeteLabel(summary: GSummaryData): string {
  if (summary.ending === null) return verdict('Playing')
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return statusLine(verdict('Won'), count(summary.nWinnerHints, 'hint'))
    case 'lost':
      return verdict('Lost', summary.ending.reason === 'timeout' ? 'out of time' : 'all conceded')
    // A Stop.
    case 'neutral':
      return statusLine(verdict('Ended'), 'no winner')
    default:
      return outcome
  }
}

export const strandsCoopGame: GameManifest = {
  gametype: 'strands_coop',
  schema: 'strands',
  baseGametype: 'strands',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find the hidden words that fill the board',
  logoUrl,

  help: helpLoader,

  // Plays solo or up to 6. Must agree with the guard in strands.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COOP,
  },

  startGameInClub: startGameInClub('coop'),

  summaryFor: (data) => makeCoopLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}

/**
 * The compete sibling. Same PlayArea / SetupForm / Help / useGame; the mode
 * branches at render time.
 */
export const strandsCompeteGame: GameManifest = {
  gametype: 'strands_compete',
  schema: 'strands',
  baseGametype: 'strands',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race the same board — fewest hints wins',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER; create_game enforces >= 2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COMPETE,
  },

  startGameInClub: startGameInClub('compete'),

  summaryFor: (data) => makeCompeteLabel(data as GSummaryData),

  submitTimeout,
  stopGame,
}
