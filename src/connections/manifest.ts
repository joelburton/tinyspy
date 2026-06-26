import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_CONNECTIONS_SETUP, type ConnectionsSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * connections's registration with the shell — **two manifests,
 * one schema, one folder.**
 *
 * "connections" is the codename for our Connections-style word-
 * grouping game. The user-facing copy reads however we like;
 * gametype / schema / folder are all `connections`.
 *
 * connections exists in coop and compete modes, each a separate
 * row in `common.gametypes` ('connections_coop', 'connections_compete')
 * and a separate Start button on the club page. Same sibling-
 * manifest pattern psychicnum introduced — see
 * [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md) for
 * the canonical write-up and `src/psychicnum/manifest.ts` for the
 * structural twin.
 *
 * Both share:
 *   - the `connections` schema (tables, RPCs, RLS — see
 *     supabase/migrations/20260615000003_connections.sql)
 *   - the folder `src/connections/` (PlayArea, SetupForm, Help,
 *     useGame, theme.css, logo.svg)
 *   - the docs file `docs/games/connections.md`
 *
 * They differ on:
 *   - `gametype` string, used as the URL segment + registry key.
 *   - `name` shown in titles and Start-button copy.
 *   - `mode` declaration (the canonical axis for downstream
 *     code that wants to distinguish behavior — see
 *     GameManifest.mode in src/common/lib/games.ts).
 *   - `numberOfPlayers`: coop allows solo (`[1, 6]`), compete
 *     requires an opposing player (`[2, 6]`).
 *   - `labelFor`: terminal copy reads differently per mode.
 *
 * Both share `baseGametype: 'connections'` — the family key any
 * code wanting "treat these as siblings" reads.
 *
 * The single shared `startGameInClub` factory builds the RPC
 * payload with the per-manifest mode injected — `connections.create_game`
 * routes on it server-side. See docs/games/connections.md for the rules,
 * architectural decisions (FE-knows-the-answer, Presence +
 * Broadcast for shared selection, pause-on-disconnect), and the
 * deferred features list.
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
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

// SetupForm is shared — puzzle picker + timer-mode field, mode-
// independent. The mode is locked at the gametype level, not a
// setup choice; clicking the coop vs compete Start button is what
// picks the mode.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

// Shared start-game caller. `mode` is the per-manifest constant —
// the RPC routes on it to write the right gametype string + the
// per-mode terminal vocabulary.
//
// **Find-or-create** preserves the baseline behavior: if this
// club has already started a game of THIS mode on the picked
// puzzle, open the existing game rather than create a duplicate.
// The .eq('mode', mode) filter is what disambiguates the
// (club, puzzle) pair across the two modes — a club can play the
// same puzzle in coop AND in compete and they're separate games.
//
// RLS makes the lookup safe: the row only appears for club members,
// belt-and-braces on top of the .eq('club_handle', ...) filter.
//
// `brand` is the manifest's own `name` (passed in from BRAND below) so
// the user-facing error reads the brand from the single branding source
// — there is no hardcoded brand string anywhere but `name`/BRAND.
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    const s = setup as ConnectionsSetup

    const existing = await db
      .from('games')
      .select('id')
      .eq('club_handle', clubHandle)
      .eq('puzzle_id', s.puzzleId)
      .eq('mode', mode)
      .maybeSingle()
    if (existing.data) return { id: existing.data.id }

    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return {
        error:
          error?.message ?? `failed to start ${brand} (${mode}) game`,
      }
    }
    return { id: data.id }
  }
}

// Shared submit_timeout dispatcher. The RPC is mode-aware
// server-side (writes 'lost' for coop, 'lost_compete' for compete)
// so the FE just fires the call; idempotent on the terminal-state
// check.
async function submitTimeout(gameId: string) {
  const { error } = await db.rpc('submit_timeout', { target_game: gameId })
  if (error) return { error: error.message }
  return {}
}

// Shared listing-label helper for coop's familiar
// "{matched}/4 categories · {mistakes}/4 mistakes" mid-game shape.
// Coop terminal labels are also derived from the same status keys.
type StatusBlob = Record<string, unknown>

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

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    const matched = (s.matched_count as number | undefined) ?? 0
    const mistakes = (s.mistake_count as number | undefined) ?? 0
    if (row.play_state === 'playing') {
      return `${matched}/4 categories · ${mistakes}/4 mistakes`
    }
    if (row.play_state === 'solved') {
      return `solved · ${mistakes} mistakes`
    }
    // Manual end (connections.end_game) — neutral, no win/loss framing.
    if (row.play_state === 'ended') {
      return `${matched}/4 categories · ended`
    }
    return `lost · ${matched}/4 matched`
  },

  submitTimeout,
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

  startGameInClub: startGameInClubFactory('compete', BRAND),

  // Compete listing labels are intentionally numeric-free — the
  // "opponents see mistakes only" decision means we don't surface
  // per-player matched_count anywhere in the club view either.
  // Terminal copy carries the winner's name (frozen onto status
  // at submit_guess time) so post-game review reads as
  // "ada won the race." Mode itself is shown by the card's <ModePill>.
  labelFor: (row) => {
    const s = (row.status ?? {}) as StatusBlob
    if (row.play_state === 'playing') return 'in progress'
    if (row.play_state === 'solved_compete') {
      const name = (s.winner_username as string | undefined) ?? 'someone'
      return `${name} won the race`
    }
    // Manual end (connections.end_game) — neutral, no winner.
    if (row.play_state === 'ended') return 'ended'
    return 'time out — no winner'
  },

  submitTimeout,
}
