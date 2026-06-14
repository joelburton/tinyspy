import { lazy } from 'react'
import type { GameManifest } from '../common/lib/games'
import { db as commonDb } from '../common/db'
import { db } from './db'

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
  Root: lazy(() =>
    import('./Root').then((m) => ({ default: m.PsychicnumRoot })),
  ),

  // Called by the common ClubPage's "Start Psychic Num" button.
  // The RPC picks the random target server-side and upserts
  // common.club_active_game (auto-pausing any other active game
  // in the club, per the v1 active-per-club invariant).
  startGameInClub: async (clubId) => {
    const { data, error } = await db
      .rpc('create_game', { target_club: clubId })
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

    return games.map((g) => ({
      gameType: 'psychicnum',
      gameId: g.id,
      startedAt: g.created_at,
      isTerminal: g.status !== 'active',
      statusLabel:
        g.status === 'active'
          ? `${g.guesses_remaining} ${g.guesses_remaining === 1 ? 'guess' : 'guesses'} left`
          : g.status === 'won'
            ? `won — ${g.winner_id ? winnerName[g.winner_id] ?? 'someone' : 'someone'} guessed it`
            : 'lost',
    }))
  },
}
