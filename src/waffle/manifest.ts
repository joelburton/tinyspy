import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { supabase } from '../common/lib/supabase/supabase'
import { db } from './db'
import { DEFAULT_WAFFLE_SETUP, type WaffleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * waffle's registration with the shell. Codename `waffle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. A Waffle-style swap-to-solve deduction puzzle — see
 * docs/games/waffle.md.
 *
 * Ships as a coop / compete sibling pair: `waffleCoopGame` (solve one
 * board together) and `waffleCompeteGame` (own board each, fewest-swaps
 * winner). Both share the `waffle` schema, the `src/waffle/` folder, and
 * the PlayArea / SetupForm / Help; they differ on gametype string, name,
 * mode, and numberOfPlayers. The per-game setup includes an optional
 * countdown timer, ended server-side via `submitTimeout`.
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

/**
 * Shared start-game caller. The board is generated on demand by the
 * `waffle-build-board` edge function (running as the caller), which
 * builds a board for the chosen band and calls
 * `waffle.create_game(target_club, setup, players, mode, board)`. `mode`
 * is the per-manifest constant, forwarded top-level. Returns `{ id }`
 * or `{ error }` whose message the dialog surfaces verbatim.
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as WaffleSetup
    const { data, error } = await supabase.functions.invoke(
      'waffle-build-board',
      {
        body: {
          target_club: clubHandle,
          setup: s,
          player_user_ids: playerUserIds,
          mode,
        },
      },
    )
    if (error) {
      // `functions.invoke` returns a generic "non-2xx" message; the
      // real server error sits on `error.context` (a Response). Read it
      // so the dialog shows what the server actually objected to.
      const ctx = (error as { context?: Response }).context
      let serverMsg: string | null = null
      if (ctx) {
        try {
          const parsed = (await ctx.json()) as { error?: string }
          if (parsed && typeof parsed.error === 'string') {
            serverMsg = parsed.error
          }
        } catch {
          // body wasn't JSON; fall through to the generic message
        }
      }
      return { error: serverMsg ?? error.message }
    }
    const payload = data as { id?: string; error?: string } | null
    if (!payload || payload.error || !payload.id) {
      return {
        error: payload?.error ?? `failed to start ${brand} (${mode})`,
      }
    }
    return { id: payload.id }
  }
}

/** Fire the countdown-timeout RPC (shared by both modes). The RPC
 *  raises "not in progress" if a peer already ended the game; we
 *  return that — GamePage swallows timeout errors. */
async function submitTimeout(gameId: string): Promise<{ error?: string }> {
  const { error } = await db.rpc('submit_timeout', { target_game: gameId })
  if (error) return { error: error.message }
  return {}
}

/** Shared end-game dispatcher — ends the game now (irreversible; the same RPC as the in-game "End game" button). */
async function endGame(gameId: string): Promise<{ error?: string }> {
  const { error } = await db.rpc('end_game', { target_game: gameId })
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
        return 'out of swaps'
      case 'lost_compete':
        return 'no winner'
      case 'ended':
        // Manual end (waffle.end_game): neutral terminal, no winner.
        return 'ended'
      default:
        return `${modeLabel === 'compete' ? 'racing' : 'solving'}…`
    }
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'SyrupSwap'

export const waffleCoopGame: GameManifest = {
  gametype: 'waffle_coop',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'coop',
  name: BRAND,
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

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: labelFor('coop'),

  submitTimeout,
  endGame,
}

export const waffleCompeteGame: GameManifest = {
  gametype: 'waffle_compete',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to unscramble the waffle',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself is degenerate.
  // Lower bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it. Must agree with require_player_count_max(6).
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: labelFor('compete'),

  submitTimeout,
  endGame,
}
