import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Database } from '../../types/db'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to codenamesduet.clues requires
// explicitly listing it here AND in the select() below.
export type ClueRow = Pick<
  Database['codenamesduet']['Tables']['clues']['Row'],
  'id' | 'turn_number' | 'by_seat' | 'word' | 'count'
>

/**
 * Subscribes to the clue history for a single game.
 *
 * Returns the full chronological list of clues (one per turn,
 * enforced by the `unique (game_id, turn_number)` constraint on
 * the `clues` table) plus a convenience `latest` pointer.
 *
 * Realtime: drives off `useRealtimeRefetch` — full refetch on
 * any postgres-changes event, plus on every SUBSCRIBED status
 * to close the missed-events-during-reconnect gap. The per-turn
 * uniqueness means the list is bounded by `games.turn_number`,
 * so the refetch cost stays small.
 */
export function useClues(gameId: string) {
  const [clues, setClues] = useState<ClueRow[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: { schema: 'codenamesduet', table: 'clues', filter: `game_id=eq.${gameId}` },
    channelPrefix: 'codenamesduet:clues',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('clues')
        .select('id, turn_number, by_seat, word, count')
        .eq('game_id', gameId)
        .order('turn_number', { ascending: true })
      if (!mounted()) return
      if (data) setClues(data)
      setLoading(false)
    },
  })

  return { clues, loading, latest: clues[clues.length - 1] ?? null }
}
