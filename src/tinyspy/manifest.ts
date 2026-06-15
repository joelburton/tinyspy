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

  // Setup form not wired up yet — landing in a follow-up commit
  // that adds turn-count + first-clue-giver options. Until then
  // ClubPage's start-button bypasses the dialog and fires this
  // RPC directly with config=null.
  setup: null,

  // Called by the common ClubPage's "Start Tinyspy" button. The RPC
  // does all the work — verifies caller is in the 2-member club,
  // seats both, picks words, generates the key card, and upserts
  // common.club_active_game.
  //
  // `config` is the typed setup payload the dialog would have
  // collected, but with `setup: null` it's always null and we don't
  // bother declaring the parameter. TypeScript's contravariance on
  // function parameter count lets this satisfy the manifest's
  // (clubId, config) signature with a (clubId)-only implementation.
  startGameInClub: async (clubId) => {
    const { data, error } = await db
      .rpc('create_game', { target_club: clubId })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start tinyspy game' }
    }
    return { id: data.id }
  },

  // Called by the common ClubPage to list tinyspy games for a club.
  // RLS limits the result to games the caller is a player in —
  // since tinyspy clubs are 2-member and both members are seated
  // on every game in the club, that lands at the same answer as
  // "every tinyspy game in this club."
  fetchClubGames: async (clubId) => {
    const { data, error } = await db
      .from('games')
      .select('id, status, created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.map((g) => ({
      gameType: 'tinyspy',
      gameId: g.id,
      startedAt: g.created_at,
      isTerminal: g.status === 'won'
        || g.status === 'lost_assassin'
        || g.status === 'lost_clock',
      statusLabel: STATUS_LABEL[g.status] ?? g.status,
    }))
  },
}

// Per-status display strings tinyspy owns — the common ClubPage
// renders these verbatim. Other games will define their own.
const STATUS_LABEL: Record<string, string> = {
  active: 'in progress',
  sudden_death: 'sudden death',
  won: 'won',
  lost_assassin: 'lost (assassin)',
  lost_clock: 'lost (ran out of time)',
}
