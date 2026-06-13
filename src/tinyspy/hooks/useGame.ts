import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import type { Database } from '../../types/db'

type GameRow = Database['tinyspy']['Tables']['games']['Row']

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
 * Roster query: we fetch `tinyspy.game_players` and `common.profiles`
 * in two separate calls and merge in JS rather than using PostgREST's
 * embedded-resource syntax. The cross-schema FK exists in Postgres
 * but PostgREST's schema cache doesn't discover relationships across
 * schemas, so the `profiles(...)` embed returns PGRST200. See the
 * inline comment in `load()` for the gory details, and naming.md's
 * "Cross-schema embeds" note for the project-level guidance.
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
      // Game row + roster fetch happen in parallel. We do NOT try to
      // embed `common.profiles` via PostgREST's `profiles(...)` syntax
      // here: PostgREST's schema cache only discovers FK relationships
      // within a single schema (the parent's schema), so the
      // `tinyspy.game_players.user_id -> common.profiles.user_id` FK
      // doesn't show up as an embeddable relationship even though it
      // exists in Postgres. Both the no-hint and `!fkname`-hinted
      // embed syntaxes return PGRST200 ("Could not find a relationship
      // ... in the schema cache").
      //
      // Workaround: fetch the (≤ 2) profiles in a second query, keyed
      // by the user_ids we just learned. Cheap at this scale; honest
      // about the cross-schema boundary; doesn't depend on PostgREST
      // behavior we'd like it to have but doesn't.
      const [gameRes, playersRes] = await Promise.all([
        supabase.schema('tinyspy').from('games').select('*').eq('id', gameId).single(),
        supabase
          .schema('tinyspy')
          .from('game_players')
          .select('user_id, seat')
          .eq('game_id', gameId)
          .order('seat'),
      ])

      const userIds = (playersRes.data ?? []).map((p) => p.user_id)
      const profilesRes = userIds.length > 0
        ? await supabase
            .schema('common')
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', userIds)
        : null
      const displayNameByUserId = new Map<string, string>(
        (profilesRes?.data ?? []).map((p) => [p.user_id, p.display_name]),
      )

      if (!mounted) return
      if (gameRes.data) setGame(gameRes.data)
      if (playersRes.data) {
        setPlayers(
          playersRes.data.map((p) => ({
            user_id: p.user_id,
            seat: p.seat as 'A' | 'B',
            display_name: displayNameByUserId.get(p.user_id) ?? '?',
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
        { event: '*', schema: 'tinyspy', table: 'games', filter: `id=eq.${gameId}` },
        load,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'tinyspy',
          table: 'game_players',
          filter: `game_id=eq.${gameId}`,
        },
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
