import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { makeRpcDispatcher, invokeStartGameEdgeFn } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  DEFAULT_WORDIPLY_SETUP_COOP,
  wordiplySetupError,
  type WordiplySetup,
} from './lib/setup'
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
 * and CSS. The mode branches at render time on `game.mode` (read from
 * `wordiply.games_state.mode`). The sibling-manifest pattern's canonical
 * write-up is in [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md);
 * wordiply follows it.
 *
 * Differences between the two manifests: the `gametype` string, the `mode`
 * declaration, `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete
 * `[2,6]`), and the per-mode `labelFor` vocabulary. Neither carries a
 * `target_rank` — wordiply is not a race-to-rank.
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
 * Shared start-game caller. Forwards `mode` as a top-level body field to
 * the edge function, which builds the board and calls
 * `wordiply.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    invokeStartGameEdgeFn(
      'wordiply-build-board',
      { target_club: clubHandle, setup: setup as WordiplySetup, player_user_ids: playerUserIds, mode },
      brand,
    )
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout
// is mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id?: string; guesses_used?: number; length_score?: number; won?: boolean }

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`wordiply`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'WordWire'

/**
 * MID-GAME the club-page label shows only guesses used (scores are
 * terminal-only, per the "length only during play" rule); TERMINAL it
 * shows the length score. Shared by both manifests' labelFor via closures.
 */
function coopLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  if (row.play_state === 'playing') {
    const used = (s.guesses_used as number | undefined) ?? 0
    return `${used}/5 guesses`
  }
  const ls = (s.length_score as number | undefined) ?? 0
  const lc = (s.letter_count as number | undefined) ?? 0
  const outcome = s.outcome as string | undefined
  const lead = outcome === 'timeout' ? 'time up' : 'done'
  return `${lead} · ${ls}% · ${lc} letters`
}

function competeLabel(row: { play_state: string; status?: unknown }): string {
  const s = (row.status ?? {}) as StatusBlob
  const leaderboard = (s.leaderboard as LeaderRow[] | undefined) ?? []
  if (row.play_state === 'playing') {
    // "3/5 · 2/5" — each active player's guesses used (no scores leak early).
    if (leaderboard.length === 0) return 'in progress'
    return leaderboard.map((e) => `${e.guesses_used ?? 0}/5`).join(' · ')
  }
  const outcome = s.outcome as string | undefined
  if (outcome === 'conceded') return 'all conceded'
  if (row.play_state === 'won_compete') {
    const winner = leaderboard.find((e) => e.won)
    const ls = winner?.length_score ?? 0
    return `winner · ${ls}%`
  }
  return 'ended · no winner'
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COOP,
    validate: (setup) => wordiplySetupError(setup as WordiplySetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => coopLabel(row),

  submitTimeout,
  endGame,
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

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COMPETE,
    validate: (setup) => wordiplySetupError(setup as WordiplySetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: (row) => competeLabel(row),

  submitTimeout,
  endGame,
}
