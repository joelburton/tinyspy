// cs-met-codenamesduet

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { db } from '../db'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { Database } from '@/types/db'

/**
 * The `codenamesduet.games` row as the play surface reads it: the turn
 * pointer and the two seats. The key cards are `useBoard`'s to read.
 *
 * Narrower than the generated row (code-conventions.md → "Avoid SELECT *"): a
 * new column is listed here AND in `useGame`'s select().
 */
export type GameRow = Pick<
  Database['codenamesduet']['Tables']['games']['Row'],
  | 'turn_number'
  | 'current_clue_giver'
  | 'user_a_id'
  | 'user_b_id'
>

/**
 * Subscribes to a single game's row.
 *
 * Returns:
 *  - `game`: the `games` row (`GameRow`); null once the load finds no row.
 *    The play state is `common.games`', and arrives via GamePageCtx
 *  - `loading`: true until the first load completes
 *  - `failure`: the envelope behind a failed read, for the loader to render
 *
 * Realtime: drives off `useRealtimeRefetch` — full refetch on
 * any `codenamesduet.games` event, plus on every SUBSCRIBED status.
 *
 * The seated players are not read here: the loader seats the row's two ids
 * from the profiles `GamePageCtx` already holds (`lib/seats.ts`). `useBoard`
 * reads the words and the events on a channel of its own; the loader runs
 * both.
 */
export function useGame(gameId: string) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRealtimeRefetch({
    tables: { schema: 'codenamesduet', table: 'games', filter: `id=eq.${gameId}` },
    channelPrefix: 'codenamesduet:game',
    id: gameId,
    load: async ({ mounted }) => {
      // No `.single()`: it treats zero rows as an ERROR, so a game this pair
      // cannot see arrived looking exactly like a broken connection. `readRows`
      // hands back rows, and `id` is the PK, so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games')
          .select('turn_number, current_clue_giver, user_a_id, user_b_id')
          .eq('id', gameId),
      )
      if (!mounted()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the sentence BEHIND it, for the loader to render.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      if (!gameRes.data[0]) {
        // Explicit null on not-found — without this, a server-side
        // delete leaves the previously-loaded game state in place and
        // the surface keeps rendering it.
        setGame(null)
        setLoading(false)
        return
      }

      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setFailure(null)
      setGame(gameRes.data[0])
      setLoading(false)
    },
  })

  return { game, loading, failure }
}
