import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_SCRABBLE_SETUP, type ScrabbleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * scrabble's registration with the shell — a Scrabble-style word game
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
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
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
      return { error: error?.message ?? `failed to start ${brand} (${mode})` }
    }
    return { id: data.id }
  }
}

async function submitTimeout(gameId: string): Promise<{ error?: string }> {
  const { error } = await db.rpc('submit_timeout', { target_game: gameId })
  if (error) return { error: error.message }
  return {}
}

/** Pure one-line label for the ClubPage games list. Mid-game shows the tiles
 *  left in the bag (+ the team score in coop); terminal shows the result —
 *  "ended" for a manual stop, the winner's name or "tie" in compete, the final
 *  team score in coop. (All values come off `row.status`, written by the RPCs;
 *  the title separately carries the first words played.) */
function labelFor(mode: 'coop' | 'compete') {
  return (row: CommonGameListRow): string => {
    const st = row.status as {
      team_score?: number
      bag_count?: number
      winner_name?: string | null
    } | null
    switch (row.play_state) {
      case 'ended':
        return 'ended'
      case 'won': // coop completion
        return st?.team_score != null ? `${st.team_score} pts` : 'finished'
      case 'won_compete':
        return st?.winner_name ? `won by ${st.winner_name}` : 'tie'
      default: {
        const left = st?.bag_count != null ? `${st.bag_count} tiles left` : ''
        if (mode === 'coop' && st?.team_score != null) {
          return left ? `${st.team_score} pts · ${left}` : `${st.team_score} pts`
        }
        return left || 'playing…'
      }
    }
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'RackAttack'

export const scrabbleCoopGame: GameManifest = {
  gametype: 'scrabble_coop',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Build words together on one board',
  logoUrl,
  help: helpLoader,
  // Solo or coop up to 4. Must agree with require_player_count_max(4).
  numberOfPlayers: [1, 4],
  PlayArea: playAreaLoader,
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP },
  startGameInClub: startGameInClubFactory('coop', BRAND),
  labelFor: labelFor('coop'),
  submitTimeout,
}

export const scrabbleCompeteGame: GameManifest = {
  gametype: 'scrabble_compete',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race for the highest score',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player. 2–4; the RPC enforces the floor.
  numberOfPlayers: [2, 4],
  PlayArea: playAreaLoader,
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP },
  startGameInClub: startGameInClubFactory('compete', BRAND),
  labelFor: labelFor('compete'),
  submitTimeout,
}
