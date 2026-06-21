import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_WAFFLE_SETUP, type WaffleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * SyrupSwap's registration with the shell. Brand name **SyrupSwap**;
 * codename `waffle` everywhere in code (schema, folder, gametype
 * strings). A Waffle-style swap-to-solve deduction puzzle — see
 * docs/games/waffle.md.
 *
 * **Slice 1 ships coop only.** The compete manifest (own board each,
 * fewest-swaps winner) + opponent strip land in slice 2; the server
 * already supports both modes.
 *
 * Both modes share the `waffle` schema, the `src/waffle/` folder, and
 * the PlayArea / SetupForm / Help. They differ on gametype string,
 * name, mode, and numberOfPlayers.
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
 *  RPC routes on it to write the right gametype string. */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as WaffleSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start SyrupSwap (${mode})` }
    }
    return { id: data.id }
  }
}

/** One-line label for the ClubPage games list — pure + synchronous. */
function labelFor(modeLabel: string) {
  return (row: CommonGameListRow): string => {
    switch (row.play_state) {
      case 'won':
      case 'won_compete':
        return `${modeLabel} · solved`
      case 'lost':
      case 'lost_compete':
        return `${modeLabel} · out of swaps`
      default:
        return `${modeLabel} · solving…`
    }
  }
}

export const waffleCoopGame: GameManifest = {
  gametype: 'waffle_coop',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'coop',
  name: 'SyrupSwap (coop)',
  shortDescription: 'Unscramble the waffle together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with
  // require_player_count_max(6) in waffle.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  labelFor: labelFor('coop'),

  // Countdown-timer auto-end is slice 2 (needs waffle.submit_timeout);
  // until then a no-op so an expired clock doesn't error.
  submitTimeout: async () => ({}),
}
