// cs-unmet

import { useMemo, useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import type { Card, DeckKind } from '../lib/cards'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'

/** Projected from `setgame.games_state` — the live table. */
export type SetgameGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  deck_kind: DeckKind
  /** The cards face-up, IN SLOT ORDER. Slot position is meaningful: it is the
   *  card's place on screen and its keyboard letter, both stable for the whole
   *  game because a claim refills in place. */
  board: Card[]
  /** Cards still undealt. The count is public; the ORDER is the one thing this
   *  game hides, and it never leaves the server. */
  deck_left: number
}

/** One row of `setgame.players`. */
export type SetgamePlayer = {
  game_id: string
  user_id: string
  sets_found: number
  /** Hints this player cashed. Per-player so the log can say who asked; the
   *  info column shows the sum. */
  hints_used: number
}

/**
 * One row of `setgame.events` — the game log.
 *
 * A **claim** is three cards taken; a **hint** is one to three cards someone
 * was shown. `board_after` is the table as it stood right after, which is what
 * lets the history viewer be a lookup instead of a replay of the deal rule.
 */
export type EventRow = {
  id: number
  game_id: string
  user_id: string
  kind: 'claim' | 'hint'
  cards: Card[]
  board_after: Card[]
  created_at: string
}

/**
 * setgame's per-gametype data hook.
 *
 * All three tables refetch, and all three genuinely move: `games` carries the
 * board itself (every claim rewrites it), `players` carries the counts the
 * opponent strip reads, and `events` is the turn log.
 *
 * **There is no Broadcast channel**, deliberately, and the reason is the
 * opposite of connections'. There, coop players build a guess together, so a
 * peer's partial selection is worth sharing. Here the whole game is spotting a
 * set before someone else does — sharing a half-made selection would either
 * hand rivals your find or, in coop, turn a race of eyes into a committee.
 * What peers see is the RESULT: three cards leave the table.
 *
 * Nothing here is mode-gated. The board is face-up, every claim happened in
 * front of everyone, and the counts are public — this is the plainest data
 * story of any game in the roster, and the only reason `games_state` exists at
 * all is to keep the undealt deck's order off the wire.
 */
export function useGame(gameId: string, selfId: string): {
  game: SetgameGame | null
  players: SetgamePlayer[]
  /** The caller's own row. */
  me: SetgamePlayer | null
  /** Every event, oldest first — the turn log's rows. */
  events: EventRow[]
  /** Just the claims, oldest first. */
  claims: EventRow[]
  /**
   * The most recent claim by ANYONE, in both modes — what the last-set panel
   * shows.
   *
   * Not scoped to the caller in compete, and that is the point: the panel's job
   * is to say what just disappeared from a shared table. Cards leave because
   * SOMEONE took them, usually not you, so a self-only panel would fall silent
   * exactly when the board changed under you.
   */
  lastClaim: EventRow | null
  /** Sets taken by the whole table. Coop shows this and only this while the
   *  game runs; the per-player breakdown waits for the terminal. */
  teamFound: number
  loading: boolean
  /** Set when a read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOkEnvelope | null
} {
  const [game, setGame] = useState<SetgameGame | null>(null)
  const [players, setPlayers] = useState<SetgamePlayer[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRealtimeRefetch({
    tables: [
      { schema: 'setgame', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'setgame', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'setgame', table: 'events', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'setgame',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, playersRes, eventsRes] = await Promise.all([
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        readRows(
          db
            .from('games_state')
            .select('id, club_handle, mode, deck_kind, board, deck_left')
            .eq('id', gameId),
        ),
        readRows(
          db
            .from('players')
            .select('game_id, user_id, sets_found, hints_used')
            .eq('game_id', gameId),
        ),
        readRows(
          db
            .from('events')
            .select('id, game_id, user_id, kind, cards, board_after, created_at')
            .eq('game_id', gameId)
            .order('id', { ascending: true }),
        ),
      ])
      if (!mounted()) return
      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the sentence BEHIND it, plus a line naming which of the reads
      // it was: "something didn't load" is not a fact anyone can act on.
      //
      // One branch each rather than one combined test, because WHICH read failed
      // is the only thing the player's sentence cannot say.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      if (playersRes.type === 'not-ok') {
        setFailure(playersRes)
        setLoading(false)
        return
      }
      if (eventsRes.type === 'not-ok') {
        setFailure(eventsRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setFailure(null)
      // ZERO ROWS is the caller's to read, and this hook's answer is the one it
      // already gave: leave `game` null and let the surface say "not found".
      const row = gameRes.data[0]
      if (row) setGame(row as unknown as SetgameGame)
      setPlayers(playersRes.data as SetgamePlayer[])
      setEvents(eventsRes.data as EventRow[])
      setLoading(false)
    },
  })

  const claims = useMemo(() => events.filter((e) => e.kind === 'claim'), [events])
  const lastClaim = claims.length ? claims[claims.length - 1] : null

  const me = useMemo(
    () => players.find((p) => p.user_id === selfId) ?? null,
    [players, selfId],
  )

  return {
    game,
    players,
    me,
    events,
    claims,
    lastClaim,
    teamFound: claims.length,
    loading,
    failure,
  }
}
