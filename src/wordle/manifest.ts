import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_WORDLE_SETUP, legalGuessError, type WordleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * wordle's registration with the shell. Codename `wordle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. A NYT-Wordle-style guess-the-word game — see
 * docs/games/wordle.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `wordle` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, name, mode, and numberOfPlayers. The per-game setup
 * is a guess budget (5–8) + an optional countdown timer, ended
 * server-side via `submitTimeout`.
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
 *  RPC routes on it to write the right gametype string and pick the
 *  target. No edge function — picking a random target is one SQL line. */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as WordleSetup
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

/** Fire the countdown-timeout RPC (shared by both modes). The RPC
 *  raises "not in progress" if a peer already ended the game; we return
 *  that — GamePage swallows timeout errors. */
async function submitTimeout(gameId: string): Promise<{ error?: string }> {
  const { error } = await db.rpc('submit_timeout', { target_game: gameId })
  if (error) return { error: error.message }
  return {}
}

/** One-line label for the ClubPage games list — pure + synchronous.
 *  The coop/compete mode is shown by the card's <ModePill>, so it's no
 *  longer prefixed here; `modeLabel` only picks the mid-game verb. */
function labelFor(modeLabel: string) {
  return (row: CommonGameListRow): string => {
    switch (row.play_state) {
      case 'won':
        return 'solved'
      case 'won_compete':
        return 'winner decided'
      case 'lost':
        return 'not solved'
      case 'lost_compete':
        return 'no winner'
      case 'ended':
        return 'ended'
      default:
        return `${modeLabel === 'compete' ? 'racing' : 'guessing'}…`
    }
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'WordNerd'

export const wordleCoopGame: GameManifest = {
  gametype: 'wordle_coop',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Guess the word together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with require_player_count_max(6).
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalGuessError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: labelFor('coop'),

  submitTimeout,
}

export const wordleCompeteGame: GameManifest = {
  gametype: 'wordle_compete',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to guess the word',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Lower bound 2; the RPC enforces it.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalGuessError(setup as WordleSetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: labelFor('compete'),

  submitTimeout,
}
