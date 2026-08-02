import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { count, outcome, statusLine, wonBy } from '../common/lib/game/statusLabel'
import {
  bunchSizeError,
  DEFAULT_BANANAGRAMS_SETUP,
  type BananagramsSetup,
} from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * bananagrams's registration with the shell — a SINGLE manifest.
 *
 * bananagrams is compete-only, so (like codenamesduet, which is coop-only)
 * it's one `common.gametypes` row and one Start button — no
 * coop/compete sibling pair, hence the bare `gametype: 'bananagrams'`
 * (the `_compete` suffix only earns its keep when there's a `_coop`
 * sibling sharing the schema). `mode: 'compete'` still tags the
 * interaction axis for any code that reads it.
 *
 * Solo is allowed: `numberOfPlayers` starts at 1 (a one-player race
 * is "finish your own tiles"), unlike the psychicnum/connections/spellingbee
 * compete siblings whose lower bound is 2.
 */

// The single source of truth for this game's user-facing brand name —
// `name` and the start-game error both read it, so a fork rebrands by
// editing this one line. The codename (`bananagrams`) is unrelated and
// stays lowercase everywhere in code.
const BRAND = 'MonkeyGrams'

export const bananagramsGame: GameManifest = {
  gametype: 'bananagrams',
  schema: 'bananagrams',
  baseGametype: 'bananagrams',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to lay out all your tiles',
  logoUrl,

  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Solo race up to a 6-player table. MUST AGREE with the
  // require_player_count_max(6) call in bananagrams.create_game. See
  // docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, 6],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_BANANAGRAMS_SETUP,
    // Gate Start until the bunch can deal everyone a starter hand
    // (bunch_size ≥ playerCount × hand_size). create_game re-checks.
    validate: (setup, playerCount) =>
      bunchSizeError(setup as BananagramsSetup, playerCount),
  },

  // Single gametype → no `mode` in the payload (the RPC writes
  // 'bananagrams' directly). The server deals the starter hands and
  // validates the setup shape; the FE-collected setup isn't trusted.
  startGameInClub: async (clubHandle, setup, playerUserIds) => {
    const s = setup as BananagramsSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start ${BRAND} game` }
    }
    return { id: data.id }
  },

  // Per-row label for the ClubPage games list. Pure + synchronous.
  // We don't write a mid-game status to common.games (progress lives
  // on bananagrams.progress), so "in progress" is the live label; the
  // 'won' label reads the winner from status, which is written when a
  // player goes out — that terminal is detected inside `peel`, not by
  // a dedicated RPC. play_state 'lost' covers the two no-winner
  // terminals — a countdown timeout and an all-conceded race — told
  // apart by status.outcome.
  labelFor: (row) => {
    const s = (row.status ?? {}) as { winner_username?: string; outcome?: string; bunch_remaining?: number }
    switch (row.play_state) {
      case 'playing':
        // The bunch is the race's clock — it's what everyone is drawing down.
        return statusLine(outcome('Playing'), count(s.bunch_remaining, 'tile in the bunch', 'tiles in the bunch'))
      case 'won':
        return wonBy(s.winner_username)
      // No-winner terminals (submit_timeout / everyone conceded), both
      // play_state 'lost'. status.outcome distinguishes them.
      case 'lost':
        return s.outcome === 'conceded'
          ? outcome('Lost', 'all conceded')
          : statusLine(outcome('Lost', 'out of time'), 'nobody finished')
      case 'ended':
        return outcome('Ended')
      default:
        return row.play_state
    }
  },

  // Fired by GamePage when a chosen countdown hits 0. Ends the race as a
  // collective loss (nobody went out in time) via bananagrams.submit_timeout.
  // Idempotent server-side, so a peer racing to fire it is fine. The shared
  // one-arg dispatcher (see common/lib/game/manifestRpcs).
  submitTimeout: makeRpcDispatcher(db, 'submit_timeout'),

  // The whole-table stop, alongside per-player `concede`. They're different
  // acts and bananagrams needs both: conceding is a LOSS on your record and it
  // takes every player doing it to close a game the group has simply lost
  // interest in. End is the group agreeing there's no result — nobody wins,
  // nobody loses.
  endGame: makeRpcDispatcher(db, 'end_game'),
}
