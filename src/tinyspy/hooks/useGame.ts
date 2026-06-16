import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import type { Database } from '../../types/db'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to tinyspy.games requires
// explicitly listing it here AND in the select() below.
type GameRow = Pick<
  Database['tinyspy']['Tables']['games']['Row'],
  | 'id'
  | 'club_id'
  | 'status'
  | 'turns_remaining'
  | 'turn_number'
  | 'current_clue_giver'
  | 'user_a_id'
  | 'user_b_id'
  | 'key_card_a'
  | 'key_card_b'
>

export type Player = {
  user_id: string
  seat: 'A' | 'B'
  username: string
}

/**
 * Subscribes to a single game's row and its player roster.
 *
 * Returns:
 *  - `game`: the `games` row (status, current_clue_giver, turn_number,
 *    seat user_ids, key cards, etc.)
 *  - `players`: the 2 seated players, with usernames embedded
 *  - `loading`: true until the first load completes
 *
 * Realtime: subscribes to `games` postgres_changes for this game. Any
 * event triggers a full re-fetch (`load()`) — chatty but simpler than
 * diffing payloads, and trivial at this data volume.
 *
 * Roster query: the user_ids come straight off the `games` row
 * (user_a_id + user_b_id columns; seats are columns now, not a side
 * table). We then fetch the (≤ 2) profiles for those uids in a
 * second query and merge in JS. We don't use PostgREST's
 * embedded-resource syntax because its schema cache doesn't discover
 * cross-schema FKs (the user_a_id/user_b_id → common.profiles.user_id
 * relationships exist in Postgres but aren't embeddable).
 *
 * Channel-name suffix: `supabase-js` caches channels by name, and in React
 * StrictMode the effect runs twice on mount. Without a unique suffix the
 * second `.on()` chain would target the already-subscribed cached channel
 * and throw "cannot add postgres_changes after subscribe". Appending a
 * UUID per effect invocation sidesteps the cache.
 */
export function useGame(gameId: string) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch + realtime-subscribe to the games row. The player roster
  // (user_a_id, user_b_id) is on the games row itself now; no
  // separate game_players query.
  useEffect(() => {
    let mounted = true

    async function load() {
      const gameRes = await db
        .from('games')
        .select(
          'id, club_id, status, turns_remaining, turn_number, current_clue_giver, user_a_id, user_b_id, key_card_a, key_card_b',
        )
        .eq('id', gameId)
        .single()

      if (!mounted) return
      if (!gameRes.data) {
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
        .select('user_id, username')
        .in('user_id', userIds)
      if (!mounted) return
      const usernameByUserId = new Map<string, string>(
        (profilesRes.data ?? []).map((p) => [p.user_id, p.username]),
      )

      setPlayers([
        {
          user_id: g.user_a_id,
          seat: 'A',
          username: usernameByUserId.get(g.user_a_id) ?? '?',
        },
        {
          user_id: g.user_b_id,
          seat: 'B',
          username: usernameByUserId.get(g.user_b_id) ?? '?',
        },
      ])

      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`game:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tinyspy', table: 'games', filter: `id=eq.${gameId}` },
        load,
      )
      // Refetch on every SUBSCRIBED status — fires on initial subscribe AND
      // on every reconnect. Closes the "missed events during a network blip"
      // gap that postgres_changes alone leaves open.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { game, players, loading }
}
