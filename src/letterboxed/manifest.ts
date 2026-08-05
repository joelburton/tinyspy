import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, outcome, statusLine, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher, invokeStartGameEdgeFn } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_LETTERBOXED_SETUP_COMPETE,
  DEFAULT_LETTERBOXED_SETUP_COOP,
  letterboxedSetupError,
  type LetterboxedSetup,
} from './lib/setup'
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
 * CSS. The mode branches at render time on `game.mode` (read from
 * `letterboxed.games_state.mode`). The sibling-manifest pattern's canonical
 * write-up is in [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md).
 *
 * Differences between the two: the `gametype` string, the `mode` declaration,
 * `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete `[2,6]`), and the
 * per-mode `labelFor` vocabulary.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `game.mode` for the compete-only
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
 * `letterboxed.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    invokeStartGameEdgeFn(
      'letterboxed-build-board',
      {
        target_club: clubHandle,
        setup: setup as LetterboxedSetup,
        player_user_ids: playerUserIds,
        mode,
      },
      brand,
    )
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout is
// mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id?: string; username?: string; words_used?: number; letters_covered?: number }

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`letterboxed`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'SnakeBox'

/** Letters on the board — the denominator every label reports against. */
const BOARD_SIZE = 12

/**
 * COOP's label is the shared chain's progress: how much of the board is
 * covered, and how much of the word budget is spent.
 */
function coopLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  const covered = (s.letters_covered as number | undefined) ?? 0
  const used = (s.words_used as number | undefined) ?? 0
  const max = (s.max_words as number | undefined) ?? 0
  const progress = `${covered}/${BOARD_SIZE} letters`

  if (row.play_state === 'playing') {
    return statusLine(outcome('Playing'), progress, `${used}/${max} words`)
  }
  if (row.play_state === 'won') {
    return statusLine(outcome('Won'), count(used, 'word'))
  }
  // The clock and the group calling it are the two coop losses; the status
  // blob's `timed_out` says which.
  if (row.play_state === 'lost') {
    return statusLine(outcome('Lost', s.timed_out === true ? 'out of time' : null), progress)
  }
  return statusLine(outcome('Ended'), progress)
}

/**
 * COMPETE's label. The race ENDS on the first solve — the bar is "cover the
 * twelve inside the cap", and being first past it is the whole game — so a
 * win names the winner. A timeout instead resolves on the most letters
 * covered, which is a different sentence.
 */
function competeLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  const leaderboard = (s.leaderboard as LeaderRow[] | undefined) ?? []

  if (row.play_state === 'playing') {
    const best = leaderboard[0]
    return statusLine(
      outcome('Playing'),
      best ? `best ${best.letters_covered ?? 0}/${BOARD_SIZE}` : `0/${BOARD_SIZE}`,
    )
  }
  if (row.play_state === 'won_compete') {
    const name = s.winner_username as string | undefined
    if (s.timed_out === true) {
      const best = leaderboard[0]
      return statusLine(
        wonBy(best?.username ?? name),
        `${best?.letters_covered ?? 0}/${BOARD_SIZE} letters`,
      )
    }
    return statusLine(wonBy(name), count((s.words_used as number | undefined) ?? 0, 'word'))
  }
  if (row.play_state === 'lost_compete') {
    return statusLine(
      outcome('Lost', s.outcome === 'conceded' ? 'all conceded' : null),
      'nobody finished',
    )
  }
  return statusLine(outcome('Ended'), 'no winner')
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COOP,
    validate: (setup) => letterboxedSetupError(setup as LetterboxedSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => coopLabel(row),

  submitTimeout,
  endGame,
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COMPETE,
    validate: (setup) => letterboxedSetupError(setup as LetterboxedSetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: (row) => competeLabel(row),

  submitTimeout,
  endGame,
}
