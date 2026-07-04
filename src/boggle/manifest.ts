import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { supabase } from '../common/lib/supabase/supabase'
import { db } from './db'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_BOGGLE_SETUP_COMPETE,
  DEFAULT_BOGGLE_SETUP_COOP,
  boggleLegalError,
  type BoggleSetup,
} from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * boggle's registration with the shell — **two manifests, one schema, one
 * folder.** Codename `boggle`; the user-facing brand is `BRAND` below. Both
 * manifests share the PlayArea, SetupForm, Help, and CSS; mode branches at
 * render time / in the RPCs. See docs/games/boggle.md for the design.
 *
 * Differences between the two: `gametype`, `mode`, `numberOfPlayers`
 * (coop allows solo `[1,8]`; compete needs an opponent `[2,8]`), the
 * `setupForm.defaults`, and the `labelFor` vocabulary.
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

/** Shared start-game caller — invokes the edge function, forwarding `mode` as a
 *  top-level field. Returns `{ id }` or `{ error }` (message surfaced verbatim
 *  by the dialog). Mirrors spellingbee's error-context unwrapping. */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const { data, error } = await supabase.functions.invoke('boggle-build-board', {
      body: {
        target_club: clubHandle,
        setup: setup as BoggleSetup,
        player_user_ids: playerUserIds,
        mode,
      },
    })
    if (error) {
      // The real server error sits on error.context (a Response); invoke()'s own
      // message is the generic "non-2xx". Surface the server's message.
      const ctx = (error as { context?: Response }).context
      let serverMsg: string | null = null
      if (ctx) {
        try {
          const parsed = (await ctx.json()) as { error?: string }
          if (parsed && typeof parsed.error === 'string') serverMsg = parsed.error
        } catch {
          // body wasn't JSON; fall through
        }
      }
      return { error: serverMsg ?? error.message }
    }
    const payload = data as { id?: string; error?: string } | null
    if (!payload || payload.error || !payload.id) {
      return { error: payload?.error ?? `failed to start ${brand} (${mode}) game` }
    }
    return { id: payload.id }
  }
}

// Timeout (mode-aware + idempotent server-side) + manual end — the shared
// one-arg RPC dispatchers (see common/lib/game/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>

/** Coop club-page label: words found + points (and the terminal reason). */
function coopLabel(row: { play_state: string; status: StatusBlob | null }): string {
  const s = row.status ?? {}
  const words = (s.found_words_count as number | undefined) ?? 0
  const pts = (s.score as number | undefined) ?? 0
  if (row.play_state === 'playing') return `${words} words · ${pts} pts`
  const outcome = s.outcome as string | undefined
  const lead = outcome === 'timeout' ? 'time up' : 'done'
  return `${lead} · ${words} words · ${pts} pts`
}

/** Compete club-page label: rank-only, no per-player scores in the listing. */
function competeLabel(row: { play_state: string; status: StatusBlob | null }): string {
  const s = row.status ?? {}
  const players = Array.isArray(s.leaderboard) ? s.leaderboard.length : 0
  if (row.play_state === 'playing') return players ? `competing · ${players} players` : 'competing'
  const outcome = s.outcome as string | undefined
  return outcome === 'timeout' ? 'time up' : 'ended'
}

// The single source of truth for this game's user-facing brand name.
const BRAND = 'MothCubes'

export const boggleCoopGame: GameManifest = {
  gametype: 'boggle_coop',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words by linking adjacent tiles',
  logoUrl,
  help: helpLoader,
  // Plays solo (1, in a solo club) or coop (up to 8). Must agree with
  // boggle.create_game's player-count guard.
  numberOfPlayers: [1, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COOP,
    validate: (setup) => boggleLegalError(setup as BoggleSetup),
  },
  startGameInClub: startGameInClubFactory('coop', BRAND),
  labelFor: coopLabel,
  submitTimeout,
  endGame,
}

export const boggleCompeteGame: GameManifest = {
  gametype: 'boggle_compete',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the most words',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COMPETE,
    validate: (setup) => boggleLegalError(setup as BoggleSetup),
  },
  startGameInClub: startGameInClubFactory('compete', BRAND),
  labelFor: competeLabel,
  submitTimeout,
  endGame,
}
