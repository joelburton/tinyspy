import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import type { Member } from '../../common/lib/games'
import { db } from '../db'

/** A SyrupSwap player. No fixed seats — every game_player can act. */
export type Player = Member

/**
 * Per-player working state, projected from `waffle.players_state`.
 * `board` / `colors` are NULL for a compete opponent mid-game (the
 * view hides them until terminal); for your own row, and in coop,
 * they're always present.
 */
export type WafflePlayerState = {
  user_id: string
  board: string | null
  colors: string | null
  swaps_used: number
  solved: boolean
  solved_at: string | null
}

/**
 * The game header, projected from `waffle.games_state`. `solution`
 * is NULL during play and materializes once the game is terminal
 * (the end-of-game reveal).
 */
export type WaffleGame = {
  id: string
  mode: 'coop' | 'compete'
  scramble: string
  max_swaps: number
  solution: string | null
}

/**
 * SyrupSwap's per-gametype data hook — the refetch-only realtime
 * pattern (Pattern A). Every move flows through `waffle.submit_swap`,
 * which writes `waffle.players` rows (in coop, every player's row);
 * those propagate to peers via the standard postgres-changes
 * subscription, and we refetch the views. Subscribes to the base
 * tables (Realtime watches tables, not views); reads the views (the
 * only path to the gated solution + visibility-aware board/colors).
 */
export function useGame(gameId: string): {
  game: WaffleGame | null
  players: WafflePlayerState[]
  loading: boolean
} {
  const [game, setGame] = useState<WaffleGame | null>(null)
  const [players, setPlayers] = useState<WafflePlayerState[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'waffle', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'waffle', table: 'players', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'waffle',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, playersRes] = await Promise.all([
        db
          .from('games_state')
          .select('id, mode, scramble, max_swaps, solution')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('players_state')
          .select('user_id, board, swaps_used, solved, solved_at, colors')
          .eq('game_id', gameId),
      ])
      if (!mounted()) return

      if (!gameRes.data) {
        setGame(null)
        setPlayers([])
        setLoading(false)
        return
      }

      setGame({
        id: gameRes.data.id as string,
        mode: gameRes.data.mode as 'coop' | 'compete',
        scramble: gameRes.data.scramble as string,
        max_swaps: gameRes.data.max_swaps as number,
        solution: (gameRes.data.solution as string | null) ?? null,
      })
      setPlayers((playersRes.data ?? []) as WafflePlayerState[])
      setLoading(false)
    },
  })

  return { game, players, loading }
}
