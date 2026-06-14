import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db } from './db'

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
  Root: lazy(() => import('./Root').then((m) => ({ default: m.TinyspyRoot }))),

  // Called by the common ClubPage's "Start Tinyspy" button. The RPC
  // does all the work — verifies caller is in the 2-member club,
  // seats both, picks words, generates the key card, and upserts
  // common.club_active_game.
  startGameInClub: async (clubId) => {
    const { data, error } = await db
      .rpc('create_game', { target_club: clubId })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start tinyspy game' }
    }
    return { id: data.id }
  },
}
