import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db as commonDb } from '../common/db'
import type { Database } from '../types/db'
import { db } from './db'
import { DEFAULT_WORDKNIT_CONFIG, type WordknitConfig } from './lib/config'

// Narrower than Database[...]['Row']. Adding a new column to
// wordknit.games requires explicitly listing it here AND in the
// select() below — see code-conventions.md's "Avoid SELECT *".
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  'id' | 'status' | 'mistakes' | 'created_at'
>

/**
 * Wordknit's registration with the shell.
 *
 * "Wordknit" is the codename for our Connections-style word-
 * grouping game (analogous to "Tinyspy" for Codenames Duet).
 * The user-facing copy reads however we like; gametype /
 * schema / folder are all `wordknit`.
 *
 * See docs/wordknit.md for the rules, the architectural
 * decisions (FE-knows-the-answer, Presence + Broadcast for
 * shared selection, freeze-on-disconnect), and the deferred
 * features list.
 */
export const wordknitGame: GameManifest = {
  gametype: 'wordknit',
  schema: 'wordknit',
  name: 'Wordknit',
  blurb: 'Find the four hidden groups of four words.',

  // Plays solo (1 player at their solo club) or coop (any number
  // of club members poke at the same board). Must agree with the
  // (absence of a) member-count check in wordknit.create_game.
  // See docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, null],

  Root: lazy(() =>
    import('./Root').then((m) => ({ default: m.WordknitRoot })),
  ),

  // POC setup is a placeholder dialog with no inputs — see
  // src/wordknit/components/Setup.tsx for the rationale.
  setup: {
    Component: lazy(() =>
      import('./components/Setup').then((m) => ({ default: m.WordknitSetup })),
    ),
    defaults: DEFAULT_WORDKNIT_CONFIG,
  },

  // SetupGameDialog calls this on submit. The RPC validates the
  // payload shape and writes the new game; the board is hardcoded
  // server-side for the POC.
  startGameInClub: async (clubId, config) => {
    const cfg = config as WordknitConfig
    const { data, error } = await db
      .rpc('create_game', { target_club: clubId, config: cfg })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start wordknit game' }
    }
    return { id: data.id }
  },

  // Lists this gametype's games for a club. RLS scopes to clubs
  // the caller is a member of. We fold a separate fetch of the
  // found-groups counts so the status label can read
  // "2/4 groups found" while in progress.
  fetchClubGames: async (clubId) => {
    const { data: games, error } = await db
      .from('games')
      .select('id, status, mistakes, created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
    if (error || !games) return []

    // Batch the found-groups counts in one query so the status
    // label can include progress. Small games + few players →
    // tiny result set, so the cost is negligible.
    const gameIds = games.map((g) => g.id)
    const foundByGame = new Map<string, number>()
    if (gameIds.length > 0) {
      const { data: rows } = await db
        .from('found_groups')
        .select('game_id')
        .in('game_id', gameIds)
      for (const r of rows ?? []) {
        foundByGame.set(r.game_id, (foundByGame.get(r.game_id) ?? 0) + 1)
      }
    }

    function labelFor(g: GameRow): string {
      const found = foundByGame.get(g.id) ?? 0
      if (g.status === 'in_progress') {
        return `${found}/4 groups · ${g.mistakes}/4 mistakes`
      }
      if (g.status === 'solved') return `solved · ${g.mistakes} mistakes`
      return `lost · ${found}/4 found`
    }

    return games.map((g) => ({
      gameType: 'wordknit',
      gameId: g.id,
      startedAt: g.created_at,
      isTerminal: g.status !== 'in_progress',
      statusLabel: labelFor(g),
    }))
  },
}

// Silence the "imported but unused" warning if a future cleanup
// drops the commonDb usage. The import is here defensively for
// the pattern shared with other games' manifests.
void commonDb
