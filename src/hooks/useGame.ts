import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

type GameRow = Database['public']['Tables']['games']['Row']

export type Player = {
  user_id: string
  seat: 'A' | 'B'
  display_name: string
}

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

    // Unique channel name per effect run: supabase-js caches channels by name,
    // and in React StrictMode the effect runs twice — without uniqueness the
    // second .on() chain hits the already-subscribed cached channel and throws.
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
