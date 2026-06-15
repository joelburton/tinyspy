import { useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../common/lib/supabase'
import { db as commonDb } from '../../common/db'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { Board, GroupLevel } from '../lib/board'

// Narrower than Database[...]['Row']. The board jsonb column is
// read once on load and stays put — only mutable fields (status,
// mistakes) appear on the realtime update payloads we care about.
type GameRow = Pick<
  Database['wordknit']['Tables']['games']['Row'],
  'id' | 'club_id' | 'status' | 'mistakes' | 'board' | 'created_at'
>

export type GuessRow = {
  id: string
  user_id: string
  tiles: string[]
  result: 'correct' | 'oneAway' | 'wrong'
  matched_level: number | null
  guessed_at: string
}

export type FoundGroupRow = {
  level: GroupLevel
  group_name: string
  members: string[]
  found_at: string
}

export type WordknitGame = {
  id: string
  club_id: string
  status: 'in_progress' | 'solved' | 'lost'
  mistakes: number
  board: Board
}

export type Member = { user_id: string; username: string }

/**
 * Loads the wordknit game row + guesses + found-groups + the
 * club's members, and exposes a `channel` handle for the
 * shared-selection / presence hooks to attach to.
 *
 * Realtime: subscribes to postgres-changes on games / guesses /
 * found_groups for this game. The same channel is the host for
 * the Broadcast (selection events) and Presence (who's here)
 * subscriptions managed by `useSharedSelection` and
 * `useGameFreeze`. Combining lets us keep one channel-per-game
 * with a unified subscribe lifecycle.
 *
 * The board (groups + tile order) is fetched once at load and
 * never re-fetched on realtime events — it doesn't change after
 * create_game, so the snapshot is canonical. Mutable state
 * (status, mistakes) is re-derived from realtime events; the
 * hook also refetches on SUBSCRIBED so we recover from any
 * events missed between initial load and channel-live.
 */
export function useGame(gameId: string): {
  game: WordknitGame | null
  guesses: GuessRow[]
  foundGroups: FoundGroupRow[]
  members: Member[]
  channel: RealtimeChannel | null
  loading: boolean
} {
  const [game, setGame] = useState<WordknitGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [foundGroups, setFoundGroups] = useState<FoundGroupRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Create the channel synchronously via useMemo so it's
  // available on first render — the BoardScreen passes it into
  // useGameFreeze and useSharedSelection, which would otherwise
  // skip a first-render's subscription. The hook re-creates the
  // channel when gameId changes (each game gets its own). The
  // matching cleanup lives in the effect below.
  const channel = useMemo(
    () => supabase.channel(`wordknit:${gameId}:${crypto.randomUUID()}`),
    [gameId],
  )

  // Fetch + realtime-subscribe to the game's tables and roster.
  // Re-runs only on gameId change; within a game, postgres_changes
  // drive load() directly.
  useEffect(() => {
    let mounted = true

    async function load() {
      const [gameRes, guessesRes, foundRes] = await Promise.all([
        db
          .from('games')
          .select('id, club_id, status, mistakes, board, created_at')
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('guesses')
          .select('id, user_id, tiles, result, matched_level, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
        db
          .from('found_groups')
          .select('level, group_name, members, found_at')
          .eq('game_id', gameId)
          .order('found_at', { ascending: true }),
      ])
      if (!mounted) return
      if (!gameRes.data) {
        setGame(null)
        setLoading(false)
        return
      }
      const row = gameRes.data as GameRow
      setGame({
        id: row.id,
        club_id: row.club_id,
        status: row.status as WordknitGame['status'],
        mistakes: row.mistakes,
        board: row.board as Board,
      })
      setGuesses(
        (guessesRes.data ?? []).map((g) => ({
          ...g,
          result: g.result as GuessRow['result'],
        })),
      )
      setFoundGroups(
        (foundRes.data ?? []).map((f) => ({
          ...f,
          level: f.level as GroupLevel,
        })),
      )

      // Pull the club's roster so the shared-selection hook can
      // label peer selections with usernames, and so useGameFreeze
      // has the expected member set. Same cross-schema pattern as
      // tinyspy / psychic-num (PostgREST embeds don't traverse
      // common → wordknit, so we resolve in two queries).
      const { data: memberRows } = await commonDb
        .from('club_members')
        .select('user_id')
        .eq('club_id', row.club_id)
      if (!mounted) return
      const ids = (memberRows ?? []).map((r) => r.user_id)
      if (ids.length > 0) {
        const { data: profiles } = await commonDb
          .from('profiles')
          .select('user_id, username')
          .in('user_id', ids)
        if (!mounted) return
        setMembers((profiles ?? []) as Member[])
      } else {
        setMembers([])
      }

      setLoading(false)
    }

    load()

    // Attach handlers to the channel built above. Broadcast +
    // presence subscriptions are attached by the consumer hooks
    // (useSharedSelection, useGameFreeze) on the same channel —
    // one channel per game, multiple listener concerns.
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'wordknit', table: 'games', filter: `id=eq.${gameId}` },
        load,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'wordknit', table: 'guesses', filter: `game_id=eq.${gameId}` },
        load,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'wordknit',
          table: 'found_groups',
          filter: `game_id=eq.${gameId}`,
        },
        load,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [channel, gameId])

  return { game, guesses, foundGroups, members, channel, loading }
}
