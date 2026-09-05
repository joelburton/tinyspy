// cs-unmet

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'
import type { Database } from '@/types/db'

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
 *
 * ZERO CLUES is an ordinary answer here — turn 1 before the giver has spoken
 * looks exactly like it — which is why a failed read has to arrive as its own
 * thing. `failure` carries it, for the PlayArea to render in place of the
 * board.
 */
export function useClues(gameId: string) {
  const [clues, setClues] = useState<ClueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRealtimeRefetch({
    tables: { schema: 'codenamesduet', table: 'clues', filter: `game_id=eq.${gameId}` },
    channelPrefix: 'codenamesduet:clues',
    id: gameId,
    load: async ({ mounted }) => {
      const res = await readRows(
        db
          .from('clues')
          .select('id, turn_number, by_seat, word, count')
          .eq('game_id', gameId)
          .order('turn_number', { ascending: true }),
      )
      if (!mounted()) return
      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged it and raised the modal. What is left
      // is the envelope behind it, and the board must not go on drawing a clue
      // list it could not load: an empty one reads as "no clue this turn".
      if (res.type === 'not-ok') {
        setFailure(res)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure — this refetches on
      // every realtime event, so an outage that ends takes its sentence with it.
      setFailure(null)
      setClues(res.data)
      setLoading(false)
    },
  })

  return { clues, loading, failure, latest: clues[clues.length - 1] ?? null }
}
