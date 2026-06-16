import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'
import { DEFAULT_TINYSPY_SETUP, type TinyspySetup } from './lib/setup'

/**
 * Tinyspy's registration with the shell. Exported as the only thing
 * outside `src/tinyspy/` needs to know about this gametype —
 * `src/games.ts` imports this constant and adds it to the registry.
 *
 * The `gametype` matches the Postgres `schema` name by convention.
 * Nothing enforces that today; the type just keeps them as separate
 * fields so we don't conflate two roles into one string.
 *
 * `Root` is lazy-loaded so that Vite emits Tinyspy's code into its
 * own chunk. The main bundle ships only the shell + common + this
 * manifest (a tiny constant); the actual game code arrives the first
 * time a user navigates into Tinyspy in a session. App.tsx wraps the
 * mount in `<Suspense>` so the brief between-chunk-fetch render is
 * handled cleanly.
 *
 * The `.then(m => ({ default: m.TinyspyRoot }))` shim re-exports the
 * named export as a default, since React.lazy expects a module with
 * a default export. We keep `TinyspyRoot` a named export in Root.tsx
 * for symmetry with everything else.
 */
export const tinyspyGame: GameManifest = {
  gametype: 'tinyspy',
  schema: 'tinyspy',
  name: 'Tinyspy',
  blurb: 'Cooperative Codenames Duet for two.',

  // Codenames Duet is intrinsically 2-player. Must agree with
  // the `member_count <> 2` check in tinyspy.create_game (in
  // supabase/migrations/*_tinyspy_setup_config.sql). See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  numberOfPlayers: [2, 2],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  // Per-game setup form: turn-count radio + first-clue-giver
  // radio. The Component is lazy-loaded so the form ships in
  // tinyspy's chunk (not the registry); `defaults` is a tiny
  // literal that travels with the manifest itself. See
  // src/common/lib/games.ts for why this split.
  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_TINYSPY_SETUP,
  },

  // Called by SetupGameDialog when the player clicks Start. The
  // RPC validates the setup shape server-side and uses it to
  // initialize the game (turns_remaining from s.turns; seat A
  // assigned to s.firstClueGiverUserId). See the
  // 20260614000002_tinyspy_setup migration.
  //
  // The `unknown` → TinyspySetup cast is safe because we own
  // both ends of the boundary (this manifest's setupForm
  // Component is the only thing populating the wrapper's value).
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as TinyspySetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubId,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start tinyspy game' }
    }
    return { id: data.id }
  },

  // Render the per-row label from a common.games row. Tinyspy's
  // play_state vocabulary is rich enough to label every row
  // without reading status jsonb (won / lost_assassin /
  // lost_clock / lost_timeout each get their own copy). Map
  // misses fall back to the raw play_state, so a future
  // play_state value renders something sensible until we add
  // its copy.
  labelFor: (row) => STATUS_LABEL[row.play_state] ?? row.play_state,

  // Called by common's GamePage when its countdown timer hits 0.
  // The RPC flips tinyspy.games.status to 'lost_timeout' (distinct
  // from 'lost_clock', which is the Duet rulebook's timer-tokens-
  // exhausted ending) and writes status_summary.outcome='lost_timeout'.
  // Idempotent on the active-state check, so peers racing to fire
  // is fine.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}

// Per-play-state display strings tinyspy owns — the common
// ClubPage renders these verbatim. Other games define their own.
const STATUS_LABEL: Record<string, string> = {
  playing: 'in progress',
  sudden_death: 'sudden death',
  won: 'won',
  lost_assassin: 'lost (assassin)',
  lost_clock: 'lost (ran out of tokens)',
  lost_timeout: 'lost (ran out of time)',
}
