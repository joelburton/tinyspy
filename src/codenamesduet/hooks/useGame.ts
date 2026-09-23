// cs-met-codenamesduet

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { db } from '../db'
import { db as commonDb } from '@/common/supabase/db'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { Member } from '@/common/members/member'
import type { Database } from '@/types/db'

/**
 * The `codenamesduet.games` row as the play surface reads it: the turn
 * pointer, the budget, both seats and both key cards.
 *
 * Narrower than the generated row (code-conventions.md → "Avoid SELECT *"): a
 * new column is listed here AND in `useGame`'s select().
 */
export type GameRow = Pick<
  Database['codenamesduet']['Tables']['games']['Row'],
  | 'id'
  | 'club_handle'
  | 'turns_remaining'
  | 'turn_number'
  | 'current_clue_giver'
  | 'user_a_id'
  | 'user_b_id'
  | 'key_card_a'
  | 'key_card_b'
>

/**
 * One of the game's two seated players: the shared `Member` plus the
 * `seat` they hold. Seat A gives the first clue; after that the seat on
 * the game row's `current_clue_giver` gives it.
 */
export type Player = Member & {
  seat: 'A' | 'B'
}

/**
 * Subscribes to a single game's row and its player roster.
 *
 * Returns:
 *  - `game`: the `games` row (`GameRow`); null once the load finds no row.
 *    The play state is `common.games`', and arrives via GamePageCtx
 *  - `players`: the 2 seated players, each with username, color and seat
 *  - `loading`: true until the first load completes
 *  - `failure`: the envelope behind a failed read, for the loader to render
 *
 * Realtime: drives off `useRealtimeRefetch` — full refetch on
 * any `codenamesduet.games` event, plus on every SUBSCRIBED status.
 *
 * Roster query: the user_ids come straight off the `games` row
 * (`user_a_id` + `user_b_id`). We then fetch the two profiles in a
 * second query and merge in JS. We don't use PostgREST's
 * embedded-resource syntax because its schema cache doesn't discover
 * cross-schema FKs (the user_a_id/user_b_id → common.profiles.user_id
 * relationships exist in Postgres but aren't embeddable).
 *
 * `useBoard` reads the words and the events on a channel of its own; the
 * loader runs both.
 */
export function useGame(gameId: string) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
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
          .select(
            'id, club_handle, turns_remaining, turn_number, current_clue_giver, user_a_id, user_b_id, key_card_a, key_card_b',
          )
          .eq('id', gameId),
      )
      if (!mounted()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the sentence BEHIND it, plus a line naming which of the reads
      // it was: "something didn't load" is not a fact anyone can act on.
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
        setPlayers([])
        setLoading(false)
        return
      }

      const g = gameRes.data[0]
      setGame(g)

      // Roster from the columns. Cross-schema profile fetch for the
      // usernames — PostgREST schema cache doesn't embed common.profiles
      // for these FKs.
      const userIds = [g.user_a_id, g.user_b_id]
      const profilesRes = await readRows(
        commonDb.from('profiles').select('user_id, username, color').in('user_id', userIds),
      )
      if (!mounted()) return
      // One branch each rather than one combined test, because WHICH read failed
      // is the only thing the player's sentence cannot say.
      if (profilesRes.type === 'not-ok') {
        setFailure(profilesRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setFailure(null)
      // One lookup map carrying both fields — the seats assembly below
      // needs username AND color per uid.
      const profileByUserId = new Map<
        string,
        { username: string; color: string }
      >(
        profilesRes.data.map((p) => [
          p.user_id,
          { username: p.username, color: p.color },
        ]),
      )
      const lookup = (uid: string) =>
        profileByUserId.get(uid) ?? { username: '?', color: 'blue' }

      setPlayers([
        {
          user_id: g.user_a_id,
          seat: 'A',
          ...lookup(g.user_a_id),
        },
        {
          user_id: g.user_b_id,
          seat: 'B',
          ...lookup(g.user_b_id),
        },
      ])

      setLoading(false)
    },
  })

  return { game, players, loading, failure }
}
