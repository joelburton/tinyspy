// cs-met-codenamesduet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { count, verdict, statusLine, tally } from '@/common/manifest/statusLabel'
import { DEFAULT_CODENAMESDUET_SETUP, type CodenamesduetSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

// The single source of truth for this game's user-facing brand name —
// `name` reads it, so a fork rebrands by editing this one line. The
// codename (`codenamesduet`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'TinySpy'

/**
 * codenamesduet's registration with the shell. Exported as the only thing
 * outside `src/codenamesduet/` needs to know about this gametype —
 * `src/gametypes.ts` imports this constant and adds it to the registry.
 *
 * The `gametype` matches the Postgres `schema` name by convention.
 * Nothing enforces that today; the type just keeps them as separate
 * fields so we don't conflate two roles into one string.
 *
 * The game's components (`PlayArea`, `Help`, `SetupForm`) are
 * lazy-loaded so that Vite emits codenamesduet's code into its own chunk.
 * The main bundle ships only the shell + common + this manifest (a
 * tiny constant); the actual game code arrives the first time a user
 * navigates into codenamesduet in a session. `GamePage` wraps the mount in
 * `<Suspense>` so the brief between-chunk-fetch render is handled
 * cleanly.
 *
 * The `.then(m => ({ default: m.PlayAreaLoader }))` shim re-exports the
 * named export as a default, since React.lazy expects a module with
 * a default export. We keep `PlayAreaLoader` (and friends) named exports
 * for symmetry with everything else.
 */
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
  // supabase/sql/codenamesduet.sql). See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  numberOfPlayers: [2, 2],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
  ),

  // Per-game setup form: turn-count radio + first-clue-giver
  // radio. The Component is lazy-loaded so the form ships in
  // codenamesduet's chunk (not the registry); `defaults` is a tiny
  // literal that travels with the manifest itself. See
  // src/common/setup-form/setupForm.ts for why this split.
  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_CODENAMESDUET_SETUP,
  },

  // Called by SetupGameModal when the player clicks Start. The
  // RPC validates the setup shape server-side and uses it to
  // initialize the game (turns_remaining from s.turns; seat A
  // assigned to s.first_clue_giver_user_id). See
  // supabase/sql/codenamesduet.sql.
  //
  // The `unknown` → CodenamesduetSetup cast is safe because we own
  // both ends of the boundary (this manifest's setupForm
  // Component is the only thing populating the wrapper's value).
  startGameInClub: async (clubHandle, setup, playerUserIds) => {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: setup as CodenamesduetSetup,
        player_user_ids: playerUserIds,
      }),
    )
  },

  // Render the per-row label from a common.games row. The verdict is
  // the play state's own (STATUS_LABEL, below); the status adds the
  // agent tally and, mid-game, the turns left. A play state missing
  // from the map renders as its raw name.
  labelFor: (row) => {
    const st = (row.status ?? {}) as { greens_found?: number; turns_remaining?: number }
    // The agent tally is the useful "should I come back to this?" fact, so it
    // rides on every line. Mid-game the turn budget rides too.
    const agents = tally(st.greens_found, 15, 'agents')
    const verdict = STATUS_LABEL[row.play_state]
    if (!verdict) return row.play_state
    return row.play_state === 'playing'
      ? statusLine(verdict, count(st.turns_remaining, 'turn left', 'turns left'), agents)
      : statusLine(verdict, agents)
  },

  // Called by common's GamePage when its countdown timer hits 0.
  // submit_timeout flips play_state to 'lost_timeout' (distinct from
  // 'lost_clock', the Duet rulebook's turns-exhausted ending) + writes
  // common.games.status.reason='timeout' — the play_state carries the verdict,
  // the reason names the cause. Idempotent, so peers racing to
  // fire it is fine. end_game is the irreversible in-game "End game" button.
  // Both are the shared one-arg dispatchers (see common/manifest/manifestRpcs).
  submitTimeout: makeRpcDispatcher(db, 'submit_timeout'),
  endGame: makeRpcDispatcher(db, 'end_game'),
}

// Per-play-state display strings codenamesduet owns — the common
// ClubPage renders these verbatim. Other games define their own.
const STATUS_LABEL: Record<string, string> = {
  playing: verdict('Playing'),
  sudden_death: 'Sudden death',
  won: verdict('Won'),
  lost_assassin: verdict('Lost', 'assassin'),
  // "turns", not "tokens": the rulebook's physical timer-tokens are just
  // the turn budget, and "tokens" doesn't help a player who never holds one.
  lost_clock: verdict('Lost', 'out of turns'),
  lost_timeout: verdict('Lost', 'out of time'),
  // Manual end (codenamesduet.end_game): the friends stopped on purpose.
  // Neutral phrasing — not a loss.
  ended: verdict('Ended'),
}
