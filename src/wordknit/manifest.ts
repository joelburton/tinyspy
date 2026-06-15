import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db as commonDb } from '../common/db'
import type { Database } from '../types/db'
import { db } from './db'
import { DEFAULT_WORDKNIT_SETUP, type WordknitSetup } from './lib/setup'

// Narrower than Database[...]['Row']. Adding a new column to
// wordknit.games requires explicitly listing it here AND in the
// select() below — see code-conventions.md's "Avoid SELECT *".
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  'id' | 'status' | 'mistake_count' | 'created_at'
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
 * shared selection, pause-on-disconnect), and the deferred
 * features list.
 */
export const wordknitGame: GameManifest = {
  gametype: 'wordknit',
  schema: 'wordknit',
  name: 'Wordknit',
  blurb: 'Match the four hidden categories of four words.',

  // Plays solo (1 player at their solo club) or coop (any number
  // of club members poke at the same board). Must agree with the
  // (absence of a) member-count check in wordknit.create_game.
  // See docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, null],

  // No manifest-level `timerMode`: wordknit's timer is a
  // per-game choice (the setup dialog has the None / Up / Down
  // radio). BoardScreen reads `game.config.timer` to drive
  // useGameTimer. The GameManifest field is preserved for
  // future games that want a fixed per-gametype timer (e.g. a
  // hypothetical Boggle with a fixed-3-minute round).

  Root: lazy(() =>
    import('./Root').then((m) => ({ default: m.WordknitRoot })),
  ),

  // Setup form: timer-mode picker (None / Up / Down with MM:SS).
  // The Component is lazy-loaded so the form ships in wordknit's
  // chunk (not the registry); `defaults` is a tiny literal that
  // travels with the manifest.
  setupForm: {
    Component: lazy(() =>
      import('./components/Setup').then((m) => ({ default: m.WordknitSetupForm })),
    ),
    defaults: DEFAULT_WORDKNIT_SETUP,
  },

  // SetupGameDialog calls this on submit. The RPC validates the
  // payload shape and writes the new game; the board is hardcoded
  // server-side for the POC.
  startGameInClub: async (clubId, setup) => {
    const s = setup as WordknitSetup
    const { data, error } = await db
      .rpc('create_game', { target_club: clubId, setup: s })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start wordknit game' }
    }
    return { id: data.id }
  },

  // Lists this gametype's games for a club. RLS scopes to clubs
  // the caller is a member of. We fold in a separate batched
  // fetch of the correct-guess counts so the status label can
  // read "2/4 categories matched" while in progress.
  //
  // (Pre-rename, this used a `found_groups` table — that table
  // is gone; one correct guess per rank, enforced by the partial
  // unique index, is the equivalent record.)
  fetchClubGames: async (clubId) => {
    const { data: games, error } = await db
      .from('games')
      .select('id, status, mistake_count, created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
    if (error || !games) return []

    const gameIds = games.map((g) => g.id)
    const matchedByGame = new Map<string, number>()
    if (gameIds.length > 0) {
      const { data: rows } = await db
        .from('guesses')
        .select('game_id')
        .in('game_id', gameIds)
        .eq('result', 'correct')
      for (const r of rows ?? []) {
        matchedByGame.set(r.game_id, (matchedByGame.get(r.game_id) ?? 0) + 1)
      }
    }

    function labelFor(g: GameRow): string {
      const matched = matchedByGame.get(g.id) ?? 0
      if (g.status === 'in_progress') {
        return `${matched}/4 categories · ${g.mistake_count}/4 mistakes`
      }
      if (g.status === 'solved') return `solved · ${g.mistake_count} mistakes`
      return `lost · ${matched}/4 matched`
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
