import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { channelDedupSuffix } from '../../common/lib/channelDedup'
import { db } from '../db'
import type { Cell } from '../lib/board'

/** One row from `scrabble.players_state` — public seat/score for everyone,
 *  plus the rack (own-only mid-game; everyone's once terminal) and the
 *  always-public tile count. In coop, `score`/`rack` are null (they live
 *  on the game row). */
export type PlayerRow = {
  user_id: string
  seat: number
  score: number | null
  rack: string[] | null
  rack_count: number
}

/** One row from `scrabble.plays` — the public move log. */
export type PlayRow = {
  user_id: string
  seq: number
  kind: 'word' | 'exchange' | 'pass'
  placements: { x: number; y: number; letter: string; blank: boolean }[] | null
  words: string[] | null
  score: number | null
  tile_count: number | null
  played_at: string
}

export type ScrabbleGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  difficulty: number
  /** The public 15×15 board — a flat 225-cell array. */
  board: Cell[]
  /** Optimistic-concurrency move counter; sent back as `base_version`. */
  version: number
  /** Tiles left in the (hidden) bag — count only. */
  bagCount: number
  /** Coop: the shared team rack + score. Null in compete. */
  sharedRack: string[] | null
  teamScore: number | null
  /** Compete: whose turn it is. Null in coop. */
  currentUserId: string | null
}

/**
 * RackAttack's per-gametype data hook — a postgres-changes realtime hook
 * (docs/code-conventions.md → "Realtime data hooks", Pattern A): one
 * UUID-suffixed channel reloading games_state / players_state / plays on
 * any change. There's no Broadcast — tentative placements are local to the
 * PlayArea (private until a commit), exactly like StackDown's private
 * in-progress word; the only cross-client state is the committed rows.
 *
 * The FE reads the VIEWS, so the bag stays a count and a compete
 * opponent's rack reads as null until the game ends.
 */
export function useGame(gameId: string): {
  game: ScrabbleGame | null
  players: PlayerRow[]
  plays: PlayRow[]
  loading: boolean
} {
  const [game, setGame] = useState<ScrabbleGame | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [plays, setPlays] = useState<PlayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(
    function joinScrabbleRoom() {
      let mounted = true

      async function load() {
        const [gameRes, playersRes, playsRes] = await Promise.all([
          db
            .from('games_state')
            .select(
              'id, club_handle, mode, difficulty, board, version, bag_count, shared_rack, team_score, current_user_id',
            )
            .eq('id', gameId)
            .maybeSingle(),
          db
            .from('players_state')
            .select('user_id, seat, score, rack, rack_count')
            .eq('game_id', gameId),
          db
            .from('plays')
            .select('user_id, seq, kind, placements, words, score, tile_count, played_at')
            .eq('game_id', gameId)
            .order('seq', { ascending: true }),
        ])
        if (!mounted) return
        if (!gameRes.data) {
          setGame(null)
          setLoading(false)
          return
        }
        const r = gameRes.data
        setGame({
          id: r.id as string,
          club_handle: r.club_handle as string,
          mode: r.mode as 'coop' | 'compete',
          difficulty: r.difficulty as number,
          board: (r.board ?? []) as unknown as Cell[],
          version: r.version as number,
          bagCount: (r.bag_count ?? 0) as number,
          sharedRack: r.shared_rack as string[] | null,
          teamScore: r.team_score as number | null,
          currentUserId: r.current_user_id as string | null,
        })
        setPlayers((playersRes.data ?? []) as PlayerRow[])
        setPlays((playsRes.data ?? []) as PlayRow[])
        setLoading(false)
      }

      const ch = supabase.channel(`scrabble:${gameId}:${channelDedupSuffix()}`)
      for (const table of ['games', 'players', 'plays'] as const) {
        ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'scrabble',
            table,
            filter: table === 'games' ? `id=eq.${gameId}` : `game_id=eq.${gameId}`,
          },
          load,
        )
      }
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') void load()
      })

      return () => {
        mounted = false
        supabase.removeChannel(ch)
      }
    },
    [gameId],
  )

  return { game, players, plays, loading }
}
