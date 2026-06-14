import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'

export type ClueRow = Database['tinyspy']['Tables']['clues']['Row']

/**
 * Subscribes to the clue history for a single game.
 *
 * Returns the full chronological list of clues (one per turn, enforced by
 * the `unique (game_id, turn_number)` constraint on the `clues` table)
 * plus a convenience `latest` pointer.
 *
 * Realtime: the `clues` table emits INSERT events when a clue is submitted
 * via `submit_clue`. We refetch the whole list on any event; the per-turn
 * uniqueness means the list size is bounded by `games.turn_number`.
 *
 * See `useGame` for the rationale on the unique channel-name suffix.
 */
export function useClues(gameId: string) {
  const [clues, setClues] = useState<ClueRow[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch + realtime-subscribe to this game's clue history. Re-runs
  // only on gameId change; within a game the channel stays live and
  // realtime events drive load() directly.
  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await db
        .from('clues')
        .select('*')
        .eq('game_id', gameId)
        .order('turn_number', { ascending: true })
      if (!mounted) return
      if (data) setClues(data)
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`clues:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'tinyspy', table: 'clues', filter: `game_id=eq.${gameId}` },
        load,
      )
      // Refetch on every SUBSCRIBED — without this, missing the clue INSERT
      // during a network blip would deadlock the guesser. See useGame.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { clues, loading, latest: clues[clues.length - 1] ?? null }
}
