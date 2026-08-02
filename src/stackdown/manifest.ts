import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { dictLabel, outcome, setupNum, statusLine, tally, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { DEFAULT_STACKDOWN_SETUP, type StackdownSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * stackdown's registration with the shell. A mahjong-style word game:
 * clear a stack of lettered tiles by spelling words off the exposed
 * ones — see docs/games/stackdown.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `stackdown` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, name, mode, and numberOfPlayers. The per-game setup
 * is just an optional countdown timer (the board is dealt at random),
 * ended server-side via `submitTimeout`.
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

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and claim a
 *  random board from the library. */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as StackdownSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start ${brand} (${mode})` }
    }
    return { id: data.id }
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/lib/game/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

/** One-line label for the ClubPage games list — pure + synchronous.
 *  The coop/compete mode is shown by the card's <ModePill>, so it's no
 *  longer prefixed here; `modeLabel` only picks the mid-game verb. */
/**
 * stackdown's club-page status line. The dict band rides on every row — the
 * words a stack is built from change the game's difficulty completely.
 *
 * Coop shows the word count (one shared board, so it's everyone's); compete
 * doesn't — each racer's found words are hidden from the others, and this
 * line is club-wide readable.
 *
 * Only ONE loss exists in either mode: the clock. There's no move budget, and
 * the board invariant guarantees every stack is clearable.
 */
function labelFor(mode: 'coop' | 'compete') {
  return (row: CommonGameListRow): string => {
    const s = (row.status ?? {}) as {
      winner_username?: string; outcome?: string
      found_words_count?: number; required_words_count?: number
    }
    const dict = dictLabel(setupNum(row.setup, 'band'))
    const found = mode === 'coop' ? tally(s.found_words_count, s.required_words_count, 'words') : null
    switch (row.play_state) {
      case 'playing':
        return statusLine(outcome('Playing'), found, dict)
      case 'won':
        return statusLine(outcome('Won'), dict)
      case 'won_compete':
        return statusLine(wonBy(s.winner_username), dict)
      case 'lost':
        // Coop only — the clock beat a team that hadn't cleared the stack.
        return statusLine(outcome('Lost', 'out of time'), found, dict)
      case 'lost_compete':
        // The clock, or the last racer conceding (common.concede).
        return s.outcome === 'conceded'
          ? outcome('Lost', 'all conceded')
          : statusLine(outcome('Lost', 'out of time'), 'no winner')
      case 'ended':
        return statusLine(outcome('Ended'), found, dict)
      default:
        return row.play_state
    }
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'StackDown'

export const stackdownCoopGame: GameManifest = {
  gametype: 'stackdown_coop',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Clear the tile stack together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with require_player_count_max(6).
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: labelFor('coop'),

  submitTimeout,
  endGame,
}

export const stackdownCompeteGame: GameManifest = {
  gametype: 'stackdown_compete',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to clear the tile stack',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Lower bound 2; the RPC enforces it.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: labelFor('compete'),

  submitTimeout,
  endGame,
}
