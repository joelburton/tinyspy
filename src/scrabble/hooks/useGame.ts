// cs-fixed-outcome-fix

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'
import type { Cell } from '../lib/board'

/** One row from `scrabble.players_state` — public seat/score for everyone,
 *  plus the rack (own-only mid-game; everyone's once terminal) and the
 *  always-public tile count. In coop, `score`/`rack` are null (they live
 *  on the game row). */
export type PlayerRow = {
  /** Every seat is somebody's — a person or one of the bots, which hold
   *  profiles like anyone. `ai_level` is what says which. */
  user_id: string
  seat: number
  score: number | null
  rack: string[] | null
  rack_count: number
  /** An AI seat's strength level (a policy.ts LEVELS name), or null for a human. */
  ai_level: string | null
}

/** One row from `scrabble.events` — the public move log. */
export type EventRow = {
  /** The row's own id, and the order of play: the database hands them out in
   *  the order the rows were written, which is what the read below orders by. */
  id: number
  /** Who played it — a person or a bot, both of them on the common roster.
   *  `seat` says which seat they were sitting in. */
  user_id: string
  seat: number
  /** 'leftovers' = a coop game ended with tiles in hand; `score` is the
   *  (negative) leftover-tile value lost. No player made that move. */
  kind: 'word' | 'exchange' | 'pass' | 'leftovers'
  placements: { x: number; y: number; letter: string; blank: boolean }[] | null
  words: string[] | null
  score: number | null
  tile_count: number | null
  created_at: string
}

export type ScrabbleGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** The public 15×15 board — a flat 225-cell array. */
  board: Cell[]
  /** Optimistic-concurrency move counter; sent back as `base_version`. */
  version: number
  /** Tiles left in the (hidden) bag — count only. */
  bagCount: number
  /** Coop: the shared team rack + score. Null in compete. */
  sharedRack: string[] | null
  teamScore: number | null
}

/**
 * scrabble's per-gametype data hook — a postgres-changes realtime hook
 * (src/common/realtime/doc.md) via the shared
 * `useRealtimeRefetch` factory: reloads games_state / players_state / events on
 * any change. There's no Broadcast — tentative placements are local to the
 * PlayArea (private until a commit), exactly like stackdown's private
 * in-progress word; the only cross-client state is the committed rows.
 *
 * The FE reads the VIEWS, so the bag stays a count and a compete
 * opponent's rack reads as null until the game ends.
 */
export function useGame(gameId: string): {
  game: ScrabbleGame | null
  players: PlayerRow[]
  plays: EventRow[]
  loading: boolean
  /** Set when a read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOkEnvelope | null
} {
  const [game, setGame] = useState<ScrabbleGame | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [plays, setPlays] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  // Subscribe to the base tables (games / players / events); `load` reads the
  // VIEWS (games_state / players_state) so the bag stays a count and a compete
  // opponent's rack reads null until terminal. No Broadcast — tentative
  // placements are local to the PlayArea until a commit.
  useRealtimeRefetch({
    tables: [
      { schema: 'scrabble', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'scrabble', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'scrabble', table: 'events', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'scrabble',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, playersRes, playsRes] = await Promise.all([
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        readRows(
          db
            .from('games_state')
            .select('id, club_handle, mode, board, version, bag_count, shared_rack, team_score')
            .eq('id', gameId),
        ),
        readRows(
          db
            .from('players_state')
            .select('user_id, seat, score, rack, rack_count, ai_level')
            .eq('game_id', gameId),
        ),
        readRows(
          db
            .from('events')
            .select('id, user_id, seat, kind, placements, words, score, tile_count, created_at')
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
      if (playsRes.type === 'not-ok') {
        setFailure(playsRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setFailure(null)

      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const r = gameRes.data[0]
      if (!r) {
        setGame(null)
        setLoading(false)
        return
      }
      setGame({
        id: r.id as string,
        club_handle: r.club_handle as string,
        mode: r.mode as 'coop' | 'compete',
        board: (r.board ?? []) as unknown as Cell[],
        version: r.version as number,
        bagCount: (r.bag_count ?? 0) as number,
        sharedRack: r.shared_rack as string[] | null,
        teamScore: r.team_score as number | null,
      })
      setPlayers(playersRes.data as PlayerRow[])
      setPlays(playsRes.data as EventRow[])
      setLoading(false)
    },
  })

  return { game, players, plays, loading, failure }
}
