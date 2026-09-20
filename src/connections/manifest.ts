// cs-met-connections

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, tally, wonBy } from '@/common/manifest/statusLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { DEFAULT_CONNECTIONS_SETUP, type ConnectionsSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * connections's registration with the shell — two manifests, one schema, one
 * folder. "connections" is the codename; the brand is `BRAND` below.
 *
 * Coop and compete are each a row in `common.gametypes` (`connections_coop`,
 * `connections_compete`) and a Start button on the club page — the
 * sibling-manifest pattern, written up at
 * [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern). The
 * two share the schema, every loader below and `baseGametype: 'connections'`;
 * they differ on `gametype`, `mode`, `numberOfPlayers` (coop plays solo,
 * compete needs an opponent) and `labelFor`. The one `startGameInClub`
 * factory injects the mode, and `connections.create_game` routes on it. The
 * rules and the design are `doc.md`'s.
 */

// Help loader is shared — both modes link to the same rules modal.
// Lazy so the prose ships in connections's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `game.mode` (read from the
// hook's loaded game row) for the compete-only OpponentStrip
// + eliminated-state UI.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// SetupForm is shared — the next-puzzle line, the date override and the
// timer, mode-independent. The mode is the Start button clicked, not a
// setup choice.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

// Shared start-game caller. `mode` is the per-manifest constant — the RPC
// routes on it. `setup` rides through untouched: with no `puzzle_id` in it,
// create_game derives the puzzle (doc.md → RPCs).
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as ConnectionsSetup,
        player_user_ids: playerUserIds,
        mode,
      }),
    )
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs). submit_timeout is mode-aware server-side
// (writes 'lost' for coop, 'lost_compete' for compete) + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

// The club-list `status` blob, read by both `labelFor`s.
type StatusBlob = Record<string, unknown>

/** Why a compete race ended with nobody solving it (connections' terminals). */
const COMPETE_LOSS: Record<string, string> = {
  timeout: 'out of time',
  mistakes: '4 mistakes',
  conceded: 'all conceded',
}

// The single source of truth for this game's user-facing brand name.
// Both sibling manifests set `name: BRAND`, and the start-game error
// reads it too — so a fork rebrands by editing this one line. The
// codename (`connections`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'WordKnit'

export const connectionsCoopGame: GameManifest = {
  gametype: 'connections_coop',
  schema: 'connections',
  baseGametype: 'connections',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find categories, like Connections',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player at their solo club) or coop (up to 6).
  // Must agree with the player-count guards in
  // connections.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const matched = (s.matched_count as number | undefined) ?? 0
    const mistakes = (s.mistake_count as number | undefined) ?? 0
    // "groups", one noun throughout the label.
    const groups = tally(matched, 4, 'groups')
    switch (row.play_state) {
      case 'playing':
        return statusLine(verdict('Playing'), groups, tally(mistakes, 4, 'mistakes'))
      case 'won':
        // Solving means 4/4, so the mistakes are the story.
        return statusLine(verdict('Won'), count(mistakes, 'mistake'))
      case 'lost':
        return statusLine(
          verdict('Lost', s.reason === 'timeout' ? 'out of time' : '4 mistakes'), groups)
      // Manual end (connections.end_game) — neutral, no win/loss framing.
      case 'ended':
        return statusLine(verdict('Ended'), groups)
      default:
        return row.play_state
    }
  },

  submitTimeout,
  endGame,
}

export const connectionsCompeteGame: GameManifest = {
  gametype: 'connections_compete',
  schema: 'connections',
  baseGametype: 'connections',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to solve, NYT Connections',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself against
  // a connections puzzle would just be a solo coop game. Lower
  // bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it server-side.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  // Compete's labels carry no counts: each racer's are their own, and this
  // line is readable by the whole club (the RPC writes an empty mid-game
  // status in compete for the same reason). The terminal line names the
  // winner, frozen onto status by submit_guess, so review reads "ada won the
  // race." Mode itself is the card's <ModeBadge>.
  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    switch (row.play_state) {
      case 'playing':
        return verdict('Playing')
      case 'won_compete':
        return wonBy(s.winner_username as string | undefined)
      // "no winner" for every cause but one: a table everybody walked away
      // from has no winner to mention, where a race played to the end does.
      // The roster keeps the same asymmetry (docs/game-status-labels.md),
      // which is why the branch is not the redundancy it looks like —
      // `COMPETE_LOSS` already holds the words.
      case 'lost_compete':
        return (s.reason as string) === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', COMPETE_LOSS[(s.reason as string) ?? ''] ?? null), 'no winner')
      // Manual end (connections.end_game) — neutral, no winner.
      case 'ended':
        return verdict('Ended')
      default:
        return row.play_state
    }
  },

  submitTimeout,
  endGame,
}
