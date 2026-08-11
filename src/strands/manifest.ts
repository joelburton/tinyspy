import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, outcome, statusLine } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_STRANDS_SETUP_COMPETE,
  DEFAULT_STRANDS_SETUP_COOP,
  strandsSetupError,
  type StrandsSetup,
} from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * strands' registration with the shell.
 *
 * "strands" is the codename for our NYT-Strands-style word search: an 8×6 board
 * whose hidden words tile it exactly, plus a spangram that runs edge to edge and
 * names the theme. The user-facing brand is **PaulPath** (the `BRAND` const
 * below); gametype / schema / folder are all `strands`.
 *
 * **Sibling pair**, one schema and one folder. The two share every component;
 * mode branches at render time on `game.mode` (read from `games_state`).
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
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
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
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as StrandsSetup,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) return { error: error ?? { message: `failed to start ${BRAND} (${mode})`, answered: true as const } }
    return { id: data.id }
  }
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>

/**
 * The club-page status line.
 *
 * The usual privacy rule here is about PEERS — "only say what every player
 * already sees" — and coop shares everything, so it doesn't bite. strands has a
 * second one though: the status blob must not leak the PUZZLE either, which is
 * why the progress is a bare count and not "n of N".
 */
function coopLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  // A COUNT, never "of N". The total is part of the answer, and `status` is
  // readable by the whole club — so the club page can say how far a game got
  // without saying how far there was to go.
  const progress = count((s.words_found as number | undefined) ?? 0, 'word')

  if (row.play_state === 'playing') return statusLine(outcome('Playing'), progress)
  if (row.play_state === 'won') return statusLine(outcome('Won'), progress)
  // The clock is the only loss strands has: the team set a timer on a puzzle
  // with a reachable end and didn't reach it (docs/states.md).
  if (row.play_state === 'lost') return statusLine(outcome('Lost', 'out of time'), progress)
  return statusLine(outcome('Ended'), progress)
}

/**
 * Compete's label says **nothing** until the game is over.
 *
 * `status` is club-readable, so anything published mid-race — word counts,
 * who's ahead — would hand rivals what the guesses RLS is keeping private. And
 * a winner genuinely isn't known before the end: the fewest-hints ranking can
 * be overturned by anyone still playing.
 */
function competeLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  if (row.play_state === 'playing') return outcome('Playing')
  if (row.play_state === 'won_compete') {
    const best = s.best_hints as number | undefined
    // The margin, not the finish order: "won on 0 hints" is the actual contest.
    return statusLine(outcome('Won'), best === undefined ? null : count(best, 'hint'))
  }
  if (row.play_state === 'lost_compete') {
    const why = s.outcome as string | undefined
    return statusLine(
      outcome('Lost', why === 'timeout' ? 'out of time' : why === 'conceded' ? 'all conceded' : 'nobody solved it'),
    )
  }
  return statusLine(outcome('Ended'), 'no winner')
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COOP,
    validate: (setup) => strandsSetupError(setup as StrandsSetup),
  },

  startGameInClub: startGameInClub('coop'),

  labelFor: coopLabel,

  submitTimeout,
  endGame,
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COMPETE,
    validate: (setup) => strandsSetupError(setup as StrandsSetup),
  },

  startGameInClub: startGameInClub('compete'),

  labelFor: competeLabel,

  submitTimeout,
  endGame,
}
