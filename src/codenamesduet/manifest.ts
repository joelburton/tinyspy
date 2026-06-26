import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_CODENAMESDUET_SETUP, type CodenamesduetSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * codenamesduet's registration with the shell. Exported as the only thing
 * outside `src/codenamesduet/` needs to know about this gametype —
 * `src/games.ts` imports this constant and adds it to the registry.
 *
 * The `gametype` matches the Postgres `schema` name by convention.
 * Nothing enforces that today; the type just keeps them as separate
 * fields so we don't conflate two roles into one string.
 *
 * The game's components (`PlayArea`, `Help`, `SetupForm`) are
 * lazy-loaded so that Vite emits codenamesduet's code into its own chunk.
 * The main bundle ships only the shell + common + this manifest (a
 * tiny constant); the actual game code arrives the first time a user
 * navigates into codenamesduet in a session. App.tsx wraps the mount in
 * `<Suspense>` so the brief between-chunk-fetch render is handled
 * cleanly.
 *
 * The `.then(m => ({ default: m.PlayArea }))` shim re-exports the
 * named export as a default, since React.lazy expects a module with
 * a default export. We keep `PlayArea` (and friends) named exports
 * for symmetry with everything else.
 */
// The single source of truth for this game's user-facing brand name —
// `name` and the start-game error both read it, so a fork rebrands by
// editing this one line. The codename (`codenamesduet`) is unrelated and
// stays lowercase everywhere in code.
const BRAND = 'TinySpy'

export const codenamesduetGame: GameManifest = {
  gametype: 'codenamesduet',
  schema: 'codenamesduet',
  baseGametype: 'codenamesduet',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find agents using word clues',
  logoUrl,

  // Help / rules modal opened from the GamePage menu's "Help"
  // item. Lazy-loaded so the help content ships in codenamesduet's
  // chunk, not the main bundle.
  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Codenames Duet is intrinsically 2-player. Must agree with
  // the player-count check in codenamesduet.create_game (in
  // supabase/migrations/20260615000001_codenamesduet.sql). See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  numberOfPlayers: [2, 2],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  // Per-game setup form: turn-count radio + first-clue-giver
  // radio. The Component is lazy-loaded so the form ships in
  // codenamesduet's chunk (not the registry); `defaults` is a tiny
  // literal that travels with the manifest itself. See
  // src/common/lib/games.ts for why this split.
  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_CODENAMESDUET_SETUP,
  },

  // Called by SetupGameDialog when the player clicks Start. The
  // RPC validates the setup shape server-side and uses it to
  // initialize the game (turns_remaining from s.turns; seat A
  // assigned to s.firstClueGiverUserId). See
  // supabase/migrations/20260615000001_codenamesduet.sql.
  //
  // The `unknown` → CodenamesduetSetup cast is safe because we own
  // both ends of the boundary (this manifest's setupForm
  // Component is the only thing populating the wrapper's value).
  startGameInClub: async (clubHandle, setup, playerUserIds) => {
    const s = setup as CodenamesduetSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start ${BRAND} game` }
    }
    return { id: data.id }
  },

  // Render the per-row label from a common.games row. codenamesduet's
  // play_state vocabulary is rich enough to label every row
  // without reading status jsonb (won / lost_assassin /
  // lost_clock / lost_timeout each get their own copy). Map
  // misses fall back to the raw play_state, so a future
  // play_state value renders something sensible until we add
  // its copy.
  labelFor: (row) => STATUS_LABEL[row.play_state] ?? row.play_state,

  // Called by common's GamePage when its countdown timer hits 0.
  // The RPC flips codenamesduet.games.status to 'lost_timeout' (distinct
  // from 'lost_clock', which is the Duet rulebook's turns-
  // exhausted ending) and writes common.games.status.outcome=
  // 'lost_timeout'. Idempotent on the terminal-state check, so
  // peers racing to fire is fine.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}

// Per-play-state display strings codenamesduet owns — the common
// ClubPage renders these verbatim. Other games define their own.
const STATUS_LABEL: Record<string, string> = {
  playing: 'in progress',
  sudden_death: 'sudden death',
  won: 'won',
  lost_assassin: 'lost (assassin)',
  // "turns", not "tokens": the rulebook's physical timer-tokens are just
  // the turn budget, and "tokens" doesn't help a player who never holds one.
  lost_clock: 'lost (ran out of turns)',
  lost_timeout: 'lost (ran out of time)',
  // Manual end (codenamesduet.end_game): the friends stopped on purpose.
  // Neutral phrasing — not a loss.
  ended: 'ended',
}
