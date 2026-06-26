import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_SCRABBLE_SETUP, type ScrabbleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * RackAttack's registration with the shell — a Scrabble-style word game
 * (codename `scrabble`); see docs/games/scrabble.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `scrabble` schema and the PlayArea / SetupForm / Help, differing on the
 * gametype string, name, mode, and numberOfPlayers. The setup is the
 * dictionary band + an optional timer; the countdown ends via
 * `submitTimeout`.
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

/** Shared start-game caller. `mode` is the per-manifest constant; the RPC
 *  routes on it to write the right gametype string + per-mode dealing. */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const s = setup as ScrabbleSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start RackAttack (${mode})` }
    }
    return { id: data.id }
  }
}

async function submitTimeout(gameId: string): Promise<{ error?: string }> {
  const { error } = await db.rpc('submit_timeout', { target_game: gameId })
  if (error) return { error: error.message }
  return {}
}

/** Pure one-line label for the ClubPage games list. Coop shows the running
 *  team score; compete just shows the phase (per-player scores aren't named
 *  here — the card's ModePill shows the mode, the score lives in-game). */
function labelFor(mode: 'coop' | 'compete') {
  return (row: CommonGameListRow): string => {
    const score = (row.status as { team_score?: number } | null)?.team_score
    switch (row.play_state) {
      case 'won':
        return score != null ? `${score} pts` : 'finished'
      case 'won_compete':
        return 'winner decided'
      case 'ended':
        return 'ended'
      default:
        return mode === 'coop' && score != null ? `${score} pts` : 'playing…'
    }
  }
}

export const scrabbleCoopGame: GameManifest = {
  gametype: 'scrabble_coop',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'coop',
  name: 'RackAttack',
  shortDescription: 'Build words together on one board',
  logoUrl,
  help: helpLoader,
  // Solo or coop up to 4. Must agree with require_player_count_max(4).
  numberOfPlayers: [1, 4],
  PlayArea: playAreaLoader,
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP },
  startGameInClub: startGameInClubFactory('coop'),
  labelFor: labelFor('coop'),
  submitTimeout,
}

export const scrabbleCompeteGame: GameManifest = {
  gametype: 'scrabble_compete',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'compete',
  name: 'RackAttack',
  shortDescription: 'Race for the highest score',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player. 2–4; the RPC enforces the floor.
  numberOfPlayers: [2, 4],
  PlayArea: playAreaLoader,
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP },
  startGameInClub: startGameInClubFactory('compete'),
  labelFor: labelFor('compete'),
  submitTimeout,
}
