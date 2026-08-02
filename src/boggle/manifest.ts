import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, outcome, setupNum, statusLine, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher, invokeStartGameEdgeFn } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_BOGGLE_SETUP_COMPETE,
  DEFAULT_BOGGLE_SETUP_COOP,
  legalError,
  type BoggleSetup,
} from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * boggle's registration with the shell — **two manifests, one schema, one
 * folder.** Codename `boggle`; the user-facing brand is `BRAND` below. Both
 * manifests share the PlayArea, SetupForm, Help, and CSS; mode branches at
 * render time / in the RPCs. See docs/games/boggle.md for the design.
 *
 * Differences between the two: `gametype`, `mode`, `numberOfPlayers`
 * (coop allows solo `[1,8]`; compete needs an opponent `[2,8]`), the
 * `setupForm.defaults`, and the `labelFor` vocabulary.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller — invokes the board-builder edge function (the
 *  shared helper owns the error-context unwrap). */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    invokeStartGameEdgeFn(
      'boggle-build-board',
      { target_club: clubHandle, setup: setup as BoggleSetup, player_user_ids: playerUserIds, mode },
      brand,
    )
}

// Timeout (mode-aware + idempotent server-side) + manual end — the shared
// one-arg RPC dispatchers (see common/lib/game/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>
type SetupBlob = Record<string, unknown> | null

/** Coop club-page label: words found + points (and the terminal reason). */
/**
 * boggle coop. A game with a TARGET can be won or lost against it; a game
 * without one is an exercise, so any ending is neutral — the same rule
 * spellingbee applies to its rank target (boggle._finish picks the play_state,
 * this just renders it).
 */
function coopLabel(row: { play_state: string; status: StatusBlob | null; setup: SetupBlob }): string {
  const s = row.status ?? {}
  const words = count(s.found_words_count as number | undefined, 'word')
  const pts = `${(s.found_words_score as number | undefined) ?? 0} pts`
  const pct = setupNum(row.setup, 'win_percent')
  switch (row.play_state) {
    case 'playing':
      return statusLine(outcome('Playing'), words, pts)
    case 'won':
      return statusLine(outcome('Won', pct != null ? `reached ${pct}%` : null), words, pts)
    case 'lost':
      return statusLine(outcome('Lost', 'out of time'), words, pts)
    case 'ended':
      return statusLine(
        outcome('Ended', (s.outcome as string) === 'timeout' ? 'out of time' : null), words, pts)
    default:
      return row.play_state
  }
}

/** Compete club-page label: rank-only, no per-player scores in the listing. */
/**
 * boggle compete. Two shapes of win: crossing the target first, and — in a
 * game with no target — holding the top score when the clock stops. A target
 * game whose clock runs out is a loss for everyone: nobody reached the bar,
 * however high the scores got.
 */
function competeLabel(row: { play_state: string; status: StatusBlob | null; setup: SetupBlob }): string {
  const s = row.status ?? {}
  const pct = setupNum(row.setup, 'win_percent')
  const top = s.top_score != null ? `${s.top_score as number} pts` : null
  switch (row.play_state) {
    case 'playing':
      return statusLine(outcome('Playing'), pct != null ? `race to ${pct}%` : null)
    case 'won_compete': {
      // A tie leaves winner_username null — they share the top score.
      const who = s.winner_username ? wonBy(s.winner_username as string) : outcome('Won', 'co-winners')
      // A target win reads "Won by alice at 65%" — one phrase. A score race
      // has no bar to name, so the winning score goes in the facts slot.
      return (s.outcome as string) === 'target' && pct != null
        ? `${who} at ${pct}%`
        : statusLine(who, top)
    }
    // Two collective losses share this state — the clock, and the last racer
    // conceding (common.concede) — told apart by status.outcome.
    case 'lost_compete':
      return (s.outcome as string) === 'conceded'
        ? outcome('Lost', 'all conceded')
        : statusLine(outcome('Lost', 'out of time'), 'no winner')
    case 'ended':
      return statusLine(outcome('Ended'), 'no winner')
    default:
      return row.play_state
  }
}

// The single source of truth for this game's user-facing brand name.
const BRAND = 'MothCubes'

export const boggleCoopGame: GameManifest = {
  gametype: 'boggle_coop',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words by linking adjacent tiles',
  logoUrl,
  help: helpLoader,
  // Plays solo (1, in a solo club) or coop (up to 8). Must agree with
  // boggle.create_game's player-count guard.
  numberOfPlayers: [1, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COOP,
    validate: (setup) => legalError(setup as BoggleSetup),
  },
  startGameInClub: startGameInClubFactory('coop', BRAND),
  labelFor: (row) => coopLabel(row),
  submitTimeout,
  endGame,
}

export const boggleCompeteGame: GameManifest = {
  gametype: 'boggle_compete',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the most words',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COMPETE,
    validate: (setup) => legalError(setup as BoggleSetup),
  },
  startGameInClub: startGameInClubFactory('compete', BRAND),
  labelFor: (row) => competeLabel(row),
  submitTimeout,
  endGame,
}
