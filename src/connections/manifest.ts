// cs-blessed-connections

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, tally, wonBy } from '@/common/manifest/statusLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import type { GameEndedReason } from '@/common/terminal/gameEnding'
import { DEFAULT_CONNECTIONS_SETUP, type ConnectionsSetup } from './lib/setup'
import { CATEGORY_COUNT, MISTAKE_BUDGET } from './lib/board'
import type { ConnectionsClubpageInfo } from './lib/statuses'
import logoUrl from './logo.svg?url'

/**
 * connections' registration with the shell — two manifests, one schema, one
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
// Lazy so the prose ships in connections' chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared; it reads `game.mode` off the row for what differs.
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
        p_club_handle: clubHandle,
        p_setup: setup as ConnectionsSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs). submit_timeout is mode-aware server-side
// (writes 'lost' for coop, 'lost_compete' for compete) + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The club-list line reads the list row's `gameEnding` and its `clubpage_info`
// (`ConnectionsClubpageInfo`: coop's team counts, null in compete, and
// compete's winner). Each mode's labelFor handles its own endings.

/** Why a game ended with nobody winning (connections' losses). */
const LOSS: Partial<Record<GameEndedReason, string>> = {
  resource_exhausted: `${MISTAKE_BUDGET} mistakes`,
  timeout: 'out of time',
  conceded: 'all conceded',
}

/** A member's username, or undefined for an id that names nobody. */
function usernameOf(members: readonly Member[], userId: string | null) {
  return userId === null ? undefined : memberById(members, userId)?.username
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

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  labelFor: (row) => {
    const clubpageInfo = row.clubpageInfo as ConnectionsClubpageInfo
    // "categories", the game's own noun (doc.md → Vocabulary), throughout.
    const categories = tally(clubpageInfo.found_categories_count, CATEGORY_COUNT, 'categories')
    if (row.gameEnding === null) {
      return statusLine(
        verdict('Playing'),
        categories,
        tally(clubpageInfo.mistake_count, MISTAKE_BUDGET, 'mistakes'),
      )
    }
    switch (row.gameEnding.outcome) {
      case 'won':
        // Solving means every category, so the mistakes are the story.
        return statusLine(verdict('Won'), count(clubpageInfo.mistake_count, 'mistake'))
      case 'lost':
        return statusLine(verdict('Lost', LOSS[row.gameEnding.reason] ?? null), categories)
      // A Stop (connections.stop_game) — neutral, no win/loss framing.
      case 'neutral':
        return statusLine(verdict('Ended'), categories)
      default:
        return row.gameEnding.outcome
    }
  },

  submitTimeout,
  stopGame,
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

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  // Compete's labels carry no counts: each racer's are their own, and this
  // line is readable by the whole club (the builder writes null counts in
  // compete for the same reason). The ended line names the winner
  // (`clubpage_info.winner_user_id`), so review reads "Won by ada." Mode
  // itself is the card's <ModeBadge>.
  labelFor: (row, members) => {
    const clubpageInfo = row.clubpageInfo as ConnectionsClubpageInfo
    if (row.gameEnding === null) return verdict('Playing')
    switch (row.gameEnding.outcome) {
      case 'won':
        return wonBy(usernameOf(members, clubpageInfo.winner_user_id))
      // "all conceded" already says nobody won; the others need spelling out.
      case 'lost':
        return row.gameEnding.reason === 'conceded'
          ? verdict('Lost', LOSS.conceded)
          : statusLine(verdict('Lost', LOSS[row.gameEnding.reason] ?? null), 'no winner')
      // A Stop (connections.stop_game) — neutral, no winner.
      case 'neutral':
        return verdict('Ended')
      default:
        return row.gameEnding.outcome
    }
  },

  submitTimeout,
  stopGame,
}
