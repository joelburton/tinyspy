import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import type { Member } from '../../common/lib/games'
import { db } from '../db'

/** A waffle player. No fixed seats — every game_player can act. */
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
 * visibility is mode-aware (see `waffle._solution_for`): COOP exposes it
 * during play (the turn-history viewer recomputes past boards' colors on
 * the FE, which needs the answer); COMPETE keeps it NULL until terminal.
 */
export type WaffleGame = {
  id: string
  mode: 'coop' | 'compete'
  scramble: string
  par_swaps: number
  max_swaps: number
  solution: string | null
}

/**
 * One entry in the coop move log (`waffle.swaps`). Only coop games
 * write these, so the array is empty in compete. `letter_a`/`letter_b`
 * are the letters that sat on `pos_a`/`pos_b` before the swap.
 */
export type SwapRow = {
  user_id: string
  seq: number
  pos_a: number
  pos_b: number
  letter_a: string
  letter_b: string
}

/**
 * waffle's per-gametype data hook — the refetch-only realtime
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
  swaps: SwapRow[]
  loading: boolean
} {
  const [game, setGame] = useState<WaffleGame | null>(null)
  const [players, setPlayers] = useState<WafflePlayerState[]>([])
  const [swaps, setSwaps] = useState<SwapRow[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'waffle', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'waffle', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'waffle', table: 'swaps', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'waffle',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, playersRes, swapsRes] = await Promise.all([
        db
          .from('games_state')
          .select('id, mode, scramble, par_swaps, max_swaps, solution')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('players_state')
          .select('user_id, board, swaps_used, solved, solved_at, colors')
          .eq('game_id', gameId),
        // The move log (coop only; empty in compete). Read straight from
        // the base table — it has no gated columns.
        db
          .from('swaps')
          .select('user_id, seq, pos_a, pos_b, letter_a, letter_b')
          .eq('game_id', gameId)
          .order('seq', { ascending: true }),
      ])
      if (!mounted()) return

      if (!gameRes.data) {
        setGame(null)
        setPlayers([])
        setSwaps([])
        setLoading(false)
        return
      }

      setGame({
        id: gameRes.data.id as string,
        mode: gameRes.data.mode as 'coop' | 'compete',
        scramble: gameRes.data.scramble as string,
        par_swaps: gameRes.data.par_swaps as number,
        max_swaps: gameRes.data.max_swaps as number,
        solution: (gameRes.data.solution as string | null) ?? null,
      })
      setPlayers((playersRes.data ?? []) as WafflePlayerState[])
      setSwaps((swapsRes.data ?? []) as SwapRow[])
      setLoading(false)
    },
  })

  return { game, players, swaps, loading }
}
