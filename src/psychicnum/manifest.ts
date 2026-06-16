import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db as commonDb } from '../common/db'
import type { Database } from '../types/db'
import { db } from './db'
import { DEFAULT_PSYCHICNUM_SETUP, type PsychicnumSetup } from './lib/setup'

// Narrower than Database[...]['Row'] — see code-conventions.md's
// "Avoid SELECT *". Adding a column to psychicnum.games requires
// listing it here AND in the select() below.
type GameRow = Pick<
  Database['psychicnum']['Tables']['games']['Row'],
  'id' | 'status' | 'guesses_remaining' | 'winner_id' | 'created_at'
>

/**
 * Psychic Num's registration with the shell. Mirrors the shape
 * of `src/tinyspy/manifest.ts` — see that file for the deeper
 * commentary on lazy-loading the Root, why gametype/schema/name
 * are separate fields, and how the registry pattern preserves
 * "remove a game in three actions."
 *
 * Psychic Num is a deliberately minimal game added second to
 * prove the multi-game architecture works (the same shell, the
 * same ClubPage, the same chat — all unchanged — pick up a new
 * game by virtue of this one file plus an entry in
 * `src/games.ts`).
 */
export const psychicnumGame: GameManifest = {
  gametype: 'psychicnum',
  schema: 'psychicnum',
  name: 'Psychic Num',
  blurb: 'Guess the secret number 1–10. Anyone can guess, 7 tries total.',

  // Psychic Num plays with any club size — the game logic doesn't
  // care how many people are guessing. Must agree with the
  // (absence of a) member-count check in psychicnum.create_game
  // (in supabase/migrations/*_psychicnum_setup_config.sql, which
  // is also the RPC that enforces club membership). See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  numberOfPlayers: [1, null],

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
  ),

  // Per-game setup form: a single-fieldset guess-budget radio.
  // The Component is lazy-loaded so the form ships in
  // psychicnum's chunk (not the registry); `defaults` is a tiny
  // literal that travels with the manifest. See
  // src/common/lib/games.ts for the split's reasoning.
  setupForm: {
    Component: lazy(() =>
      import('./components/Setup').then((m) => ({ default: m.PsychicnumSetupForm })),
    ),
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  // Called by SetupGameDialog when the player clicks Start. The
  // RPC picks the random target server-side, validates the setup
  // shape, initializes guesses_remaining from setup.guesses, and
  // (via common.create_game) flips is_active=true on the new
  // common.games row — auto-suspending any prior active game in
  // the club per the v1 active-per-club invariant.
  //
  // The `unknown` → PsychicnumSetup cast is safe because we own
  // both ends of the boundary (this manifest's setupForm
  // Component is the only thing populating the wrapper's value).
  startGameInClub: async (clubId, setup, playerUserIds) => {
    const s = setup as PsychicnumSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubId,
        setup: s,
        player_user_ids: playerUserIds,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? 'failed to start psychic num game' }
    }
    return { id: data.id }
  },

  // Lists this gametype's games for a club. RLS restricts the
  // result to clubs the caller is a member of.
  //
  // For won games we want the status label to say
  // "won — <username> guessed it", which needs the winner's
  // username. We batch-fetch profiles for all winners in a
  // single follow-up query rather than doing N+1 lookups; the
  // result count per club is small so the cost is negligible.
  fetchClubGames: async (clubId) => {
    const { data: games, error } = await db
      .from('games')
      .select('id, status, guesses_remaining, winner_id, created_at')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
    if (error || !games) return []

    const winnerIds = Array.from(
      new Set(
        games
          .map((g) => g.winner_id)
          .filter((id): id is string => id !== null),
      ),
    )
    const winnerName: Record<string, string> = {}
    if (winnerIds.length > 0) {
      const { data: profiles } = await commonDb
        .from('profiles')
        .select('user_id, username')
        .in('user_id', winnerIds)
      for (const p of profiles ?? []) {
        winnerName[p.user_id] = p.username
      }
    }

    // Build the human-readable per-row status. Lifted out of the
    // .map() ternary nest so each branch reads on its own line.
    //
    // The 'won' branch's winner-name lookup is the one expected to
    // disappear when the winner_id overspec is removed (see
    // docs/deferred.md → Psychic Num); that'll collapse the whole
    // function to two cases.
    function labelFor(g: GameRow): string {
      if (g.status === 'active') {
        const word = g.guesses_remaining === 1 ? 'guess' : 'guesses'
        return `${g.guesses_remaining} ${word} left`
      }
      if (g.status === 'won') {
        const name = g.winner_id ? winnerName[g.winner_id] ?? 'someone' : 'someone'
        return `won — ${name} guessed it`
      }
      return 'lost'
    }

    return games.map((g) => ({
      gameType: 'psychicnum',
      gameId: g.id,
      startedAt: g.created_at,
      isTerminal: g.status !== 'active',
      statusLabel: labelFor(g),
    }))
  },

  // Called by common's GamePage when its countdown timer hits 0.
  // The RPC flips this gametype's status to 'lost' and writes
  // status_summary.outcome='lost_timeout'. Idempotent on the
  // terminal-state check, so peers racing to fire is fine.
  submitTimeout: async (gameId) => {
    const { error } = await db.rpc('submit_timeout', { target_game: gameId })
    if (error) return { error: error.message }
    return {}
  },
}
