import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

type GameRow = Database['public']['Tables']['games']['Row']

export type Player = {
  user_id: string
  seat: 'A' | 'B'
  display_name: string
}

/**
 * Subscribes to a single game's row and its player roster.
 *
 * Returns:
 *  - `game`: the `games` row (status, current_clue_giver, turn_number, etc.)
 *  - `players`: the (≤ 2) seated players, with display names embedded
 *  - `loading`: true until the first load completes
 *
 * Realtime: subscribes to `games` and `game_players` postgres_changes for
 * this game. Any event triggers a full re-fetch (`load()`) — chatty but
 * simpler than diffing payloads, and trivial at this data volume.
 *
 * Roster query uses PostgREST's embedded resource syntax via the FK
 * `game_players.user_id → profiles.user_id` to pull `display_name` in
 * one round trip. (That FK was chosen specifically to make this embed work;
 * see the baseline migration's comment on game_players.user_id.)
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

  useEffect(() => {
    let mounted = true

    async function load() {
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase
          .from('game_players')
          .select('user_id, seat, profiles(display_name)')
          .eq('game_id', gameId)
          .order('seat'),
      ])
      if (!mounted) return
      if (gameRes.data) setGame(gameRes.data)
      if (playersRes.data) {
        setPlayers(
          playersRes.data.map((p) => ({
            user_id: p.user_id,
            seat: p.seat as 'A' | 'B',
            display_name: p.profiles?.display_name ?? '?',
          })),
        )
      }
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`game:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        load,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `game_id=eq.${gameId}`,
        },
        load,
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { game, players, loading }
}
