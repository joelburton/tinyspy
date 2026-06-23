import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_WORDLE_SETUP, type WordleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * WordNerd's registration with the shell. Brand name **WordNerd**;
 * codename `wordle` everywhere in code (schema, folder, gametype
 * strings). A NYT-Wordle-style guess-the-word game — see
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
function startGameInClubFactory(mode: 'coop' | 'compete') {
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
      return { error: error?.message ?? `failed to start WordNerd (${mode})` }
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

/** One-line label for the ClubPage games list — pure + synchronous. */
function labelFor(modeLabel: string) {
  return (row: CommonGameListRow): string => {
    switch (row.play_state) {
      case 'won':
        return `${modeLabel} · solved`
      case 'won_compete':
        return `${modeLabel} · winner decided`
      case 'lost':
        return `${modeLabel} · not solved`
      case 'lost_compete':
        return `${modeLabel} · no winner`
      case 'ended':
        return `${modeLabel} · ended`
      default:
        return `${modeLabel} · ${modeLabel === 'compete' ? 'racing' : 'guessing'}…`
    }
  }
}

export const wordleCoopGame: GameManifest = {
  gametype: 'wordle_coop',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'coop',
  name: 'WordNerd (coop)',
  shortDescription: 'Guess the word together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with require_player_count_max(6).
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  labelFor: labelFor('coop'),

  submitTimeout,
}

export const wordleCompeteGame: GameManifest = {
  gametype: 'wordle_compete',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'compete',
  name: 'WordNerd (compete)',
  shortDescription: 'Race to guess the word',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Lower bound 2; the RPC enforces it.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  labelFor: labelFor('compete'),

  submitTimeout,
}
