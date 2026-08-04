import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, outcome, statusLine } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { DEFAULT_STRANDS_SETUP_COOP, strandsSetupError, type StrandsSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * strands' registration with the shell.
 *
 * "strands" is the codename for our NYT-Strands-style word search: an 8×6 board
 * whose hidden words tile it exactly, plus a spangram that runs edge to edge and
 * names the theme. The user-facing brand is **PaulPath** (the `BRAND` const
 * below); gametype / schema / folder are all `strands`.
 *
 * **Coop-first.** Only `strands_coop` is registered — in `common.gametypes` as
 * well as here — because a Start button for an unbuilt game is worse than a
 * missing one. The compete sibling follows the usual pattern when it lands
 * (`strands_compete`, same schema, same folder, `baseGametype: 'strands'`), and
 * `strands.create_game` already refuses `mode = 'compete'` explicitly rather
 * than half-working.
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

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>

/**
 * The club-page status line. Everything strands tracks in coop is shared, so
 * there is no privacy question here — the "a status line may only say what every
 * player already sees" rule bites the compete sibling, not this one.
 */
function labelFor(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  const found = (s.words_found as number | undefined) ?? 0
  const total = (s.words_total as number | undefined) ?? 0
  const progress = total ? `${found}/${total} words` : count(found, 'word')

  if (row.play_state === 'playing') return statusLine(outcome('Playing'), progress)
  if (row.play_state === 'won') return statusLine(outcome('Won'), progress)
  // The clock is the only loss strands has: the team set a timer on a puzzle
  // with a reachable end and didn't reach it (docs/states.md).
  if (row.play_state === 'lost') return statusLine(outcome('Lost', 'out of time'), progress)
  return statusLine(outcome('Ended'), progress)
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

  startGameInClub: async (clubHandle, setup, playerUserIds) => {
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as StrandsSetup,
        player_user_ids: playerUserIds,
        mode: 'coop',
      })
      .single()
    if (error || !data) return { error: error?.message ?? `failed to start ${BRAND}` }
    return { id: data.id }
  },

  labelFor,

  submitTimeout,
  endGame,
}
