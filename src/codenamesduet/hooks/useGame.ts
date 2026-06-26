import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import type { Member } from '../../common/lib/games'
import type { Database } from '../../types/db'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to codenamesduet.games requires
// explicitly listing it here AND in the select() below.
type GameRow = Pick<
  Database['codenamesduet']['Tables']['games']['Row'],
  | 'id'
  | 'club_handle'
  | 'turns_remaining'
  | 'turn_number'
  | 'current_clue_giver'
  | 'user_a_id'
  | 'user_b_id'
  | 'key_card_a'
  | 'key_card_b'
>

/**
 * One player in a codenamesduet game. Extends the shared `Member`
 * shape with a `seat` field — codenamesduet is intrinsically 2-seat
 * (A is the next clue-giver, B is the next guesser; they swap
 * each turn). Other games re-export Member as Player without
 * extending; codenamesduet's seat is the legitimate per-game
 * enrichment that justifies the type-level distinction. */
export type Player = Member & {
  seat: 'A' | 'B'
}

/**
 * Subscribes to a single game's row and its player roster.
 *
 * Returns:
 *  - `game`: the `games` row (current_clue_giver, turn_number,
 *    seat user_ids, key cards, etc. — play_state moved to
 *    common.games and arrives via GamePageCtx)
 *  - `players`: the 2 seated players, with usernames embedded
 *  - `loading`: true until the first load completes
 *
 * Realtime: drives off `useRealtimeRefetch` — full refetch on
 * any `codenamesduet.games` event, plus on every SUBSCRIBED status.
 *
 * Roster query: the user_ids come straight off the `games` row
 * (user_a_id + user_b_id columns; seats are columns now, not a side
 * table). We then fetch the (≤ 2) profiles for those uids in a
 * second query and merge in JS. We don't use PostgREST's
 * embedded-resource syntax because its schema cache doesn't discover
 * cross-schema FKs (the user_a_id/user_b_id → common.profiles.user_id
 * relationships exist in Postgres but aren't embeddable).
 *
 * Hook split (useGame here + useBoard + useClues, three hooks):
 * deliberate, matches the per-concern PlayArea decomposition. The
 * tradeoff is three SUBSCRIBED refetches on reconnect (one per
 * channel) instead of one batched fetch — accepted as the cost of
 * keeping each concern's data lifecycle independent. Don't
 * consolidate without rethinking the PlayArea component split.
 * psychicnum + connections use the alternative one-hook-many-tables
 * shape, which is the right choice when the data flows back to a
 * single PlayArea component.
 */
export function useGame(gameId: string) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: { schema: 'codenamesduet', table: 'games', filter: `id=eq.${gameId}` },
    channelPrefix: 'game',
    id: gameId,
    load: async ({ mounted }) => {
      const gameRes = await db
        .from('games')
        .select(
          'id, club_handle, turns_remaining, turn_number, current_clue_giver, user_a_id, user_b_id, key_card_a, key_card_b',
        )
        .eq('id', gameId)
        .single()

      if (!mounted()) return
      if (!gameRes.data) {
        // Explicit null on not-found — without this, a server-side
        // delete (e.g. db:reset during dev) leaves the previously-
        // loaded game state in place and the PlayArea keeps
        // rendering it. Matches psychicnum / connections useGame.
        setGame(null)
        setPlayers([])
        setLoading(false)
        return
      }

      const g = gameRes.data
      setGame(g)

      // Roster from the columns. Cross-schema profile fetch for the
      // usernames — PostgREST schema cache doesn't embed common.profiles
      // for these FKs.
      const userIds = [g.user_a_id, g.user_b_id]
      const profilesRes = await commonDb
        .from('profiles')
        .select('user_id, username, color')
        .in('user_id', userIds)
      if (!mounted()) return
      // Single lookup map carrying both fields — the seats
      // assembly below needs username AND color per uid, and
      // building one map is cheaper to read than two.
      const profileByUserId = new Map<
        string,
        { username: string; color: string }
      >(
        (profilesRes.data ?? []).map((p) => [
          p.user_id,
          { username: p.username, color: p.color },
        ]),
      )
      const lookup = (uid: string) =>
        profileByUserId.get(uid) ?? { username: '?', color: 'blue' }

      setPlayers([
        {
          user_id: g.user_a_id,
          seat: 'A',
          ...lookup(g.user_a_id),
        },
        {
          user_id: g.user_b_id,
          seat: 'B',
          ...lookup(g.user_b_id),
        },
      ])

      setLoading(false)
    },
  })

  return { game, players, loading }
}
